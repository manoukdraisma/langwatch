import {
  UserRole,
  type Organization,
  type OrganizationUser,
  type Project,
  type Team,
  type TeamUser,
  type User,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import slugify from "slugify";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sendInviteEmail } from "../../mailer/inviteEmail";

export type TeamWithProjects = Team & {
  projects: Project[];
};

export type FullyLoadedOrganization = Organization & {
  teams: TeamWithProjects[];
};

export type TeamMemberWithUser = TeamUser & {
  user: User;
};

export type TeamMemberWithTeam = TeamUser & {
  team: Team;
};

export type TeamWithMembersAndProjects = Team & {
  members: TeamMemberWithUser[];
  projects: Project[];
};

export type UserWithTeams = User & {
  teamMemberships: TeamMemberWithTeam[];
};

export type OrganizationMemberWithUser = OrganizationUser & {
  user: UserWithTeams;
};

export type OrganizationWithMembersAndTheirTeams = Organization & {
  members: OrganizationMemberWithUser[];
};

export const organizationRouter = createTRPCRouter({
  createAndAssign: protectedProcedure
    .input(
      z.object({
        orgName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const prisma = ctx.prisma;

      const orgId = nanoid();
      const orgSlug =
        slugify(input.orgName, { lower: true, strict: true }) +
        "-" +
        orgId.substring(0, 6);

      const teamId = nanoid();
      const teamSlug =
        slugify(input.orgName, { lower: true, strict: true }) +
        "-" +
        teamId.substring(0, 6);

      await prisma.$transaction(async (prisma) => {
        // 1. Create the organization
        const organization = await prisma.organization.create({
          data: {
            id: orgId,
            name: input.orgName,
            slug: orgSlug,
          },
        });

        // 2. Assign the user to the organization
        await prisma.organizationUser.create({
          data: {
            userId: userId,
            organizationId: organization.id,
            role: "ADMIN", // Assuming the user becomes an admin of the created organization
          },
        });

        // 3. Create the default team
        const team = await prisma.team.create({
          data: {
            id: teamId,
            name: input.orgName, // Same name as organization
            slug: teamSlug, // Same as organization
            organizationId: organization.id,
          },
        });

        // 4. Assign the user to the team
        await prisma.teamUser.create({
          data: {
            userId: userId,
            teamId: team.id,
            role: "ADMIN", // Assuming the user becomes an admin of the created team
          },
        });
      });

      // Return success response
      return { success: true, teamSlug };
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const prisma = ctx.prisma;

    const organizations: FullyLoadedOrganization[] =
      await prisma.organization.findMany({
        where: {
          members: {
            some: {
              userId: userId,
            },
          },
        },
        include: {
          teams: {
            include: {
              projects: true,
            },
          },
        },
      });

    return organizations;
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        joinAllTeams: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const prisma = ctx.prisma;

      const organizationUser = await prisma.organizationUser.findFirst({
        where: {
          userId: userId,
          organizationId: input.id,
          role: "ADMIN",
        },
      });

      if (!organizationUser) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have the necessary permissions",
        });
      }

      await prisma.organization.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          joinAllTeams: input.joinAllTeams,
        },
      });

      return { success: true };
    }),

  getOrganizationWithMembersAndTheirTeams: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const prisma = ctx.prisma;

      const organization = await prisma.organization.findFirst({
        where: {
          id: input.id,
          members: {
            some: {
              userId: userId,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                include: {
                  teamMemberships: {
                    include: {
                      team: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      return organization;
    }),
  createInvites: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        invites: z.array(
          z.object({
            email: z.string().email(),
            teamIds: z.string(),
            role: z.nativeEnum(UserRole),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma;
      const userId = ctx.session.user.id;

      // Check if the user is an admin of the organization
      const organization = await prisma.organization.findFirst({
        where: {
          id: input.organizationId,
          members: {
            some: {
              userId: userId,
              role: "ADMIN",
            },
          },
        }
      });

      if (!organization) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be an admin to send invites.",
        });
      }

      const invites = await Promise.all(
        input.invites.map(async (invite) => {
          if (!invite.email.trim() || !invite.teamIds.trim()) {
            return null;
          }

          // Filter out team IDs that do not belong to the organization
          const validTeamIds = (
            await prisma.team.findMany({
              where: {
                id: { in: invite.teamIds.split(",") },
                organizationId: input.organizationId,
              },
              select: { id: true },
            })
          ).map((team) => team.id);

          // If no valid team IDs are found, skip this invite
          if (validTeamIds.length === 0) {
            return null;
          }

          const inviteCode = nanoid();
          const savedInvite = await prisma.organizationInvite.create({
            data: {
              email: invite.email,
              inviteCode: inviteCode,
              expiration: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
              organizationId: input.organizationId,
              teamIds: validTeamIds.join(","),
              role: invite.role,
            },
          });

          await sendInviteEmail({ req: ctx.req, email: invite.email, organization, inviteCode });

          return savedInvite;
        })
      );

      // Filter out any null values (skipped invites)
      return invites.filter(Boolean);
    }),
});
