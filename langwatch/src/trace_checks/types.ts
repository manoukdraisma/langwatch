import type {
  ElasticSearchSpan,
  Trace,
  TraceCheck,
} from "../server/tracer/types";
import type { Money } from "../utils/types";

export type Checks = {
  pii_check: {
    parameters: {
      infoTypes: {
        phoneNumber: boolean;
        emailAddress: boolean;
        creditCardNumber: boolean;
        ibanCode: boolean;
        ipAddress: boolean;
        passport: boolean;
        vatNumber: boolean;
        medicalRecordNumber: boolean;
      };
      minLikelihood: "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
      checkPiiInSpans: boolean;
    };
  };
  toxicity_check: {
    parameters: {
      categories: {
        harassment: boolean;
        "harassment/threatening": boolean;
        hate: boolean;
        "hate/threatening": boolean;
        "self-harm": boolean;
        "self-harm/intent": boolean;
        "self-harm/instructions": boolean;
        sexual: boolean;
        "sexual/minors": boolean;
        violence: boolean;
        "violence/graphic": boolean;
      };
    };
  };
  custom: {
    parameters: {
      rules: CustomCheckRules;
    };
  };
};

export type CheckTypes = keyof Checks;

// Zod type will not be generated for this one, check ts-to-zod.config.js
export type TraceCheckJob = {
  check: {
    id: string;
    type: CheckTypes;
    name: string;
  };
  trace: {
    id: string;
    project_id: string;
    thread_id?: string | undefined;
    user_id?: string | undefined;
    customer_id?: string | undefined;
    labels?: string[] | undefined;
  };
};

export type TopicClusteringJob = {
  project_id: string;
};

// Zod type will not be generated for this one, check ts-to-zod.config.js
export type TraceCheckResult = {
  raw_result: object;
  value: number;
  status: "failed" | "succeeded";
  costs: Money[];
};

export type TraceCheckBackendDefinition<T extends CheckTypes> = {
  execute: (
    trace: Trace,
    spans: ElasticSearchSpan[],
    parameters: Checks[T]["parameters"]
  ) => Promise<TraceCheckResult>;
};

export type TraceCheckFrontendDefinition = {
  name: string;
  description: string;
  render: (props: { check: TraceCheck }) => JSX.Element;
};

export type ModerationResult = {
  id: string;
  model: string;
  results: ModerationResultEntry[];
};

export type ModerationResultEntry = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
};

export type CustomCheckFields = "input" | "output";

export type CustomCheckFailWhen = {
  condition: ">" | "<" | ">=" | "<=" | "==";
  amount: number;
};

export type CustomCheckRule =
  | {
      field: CustomCheckFields;
      rule: "contains";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "not_contains";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "matches_regex";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "not_matches_regex";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "is_similar_to";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
      openai_embeddings?: number[];
      failWhen: CustomCheckFailWhen;
    }
  | {
      field: CustomCheckFields;
      rule: "llm_boolean";
      /**
       * @minLength 1
       * @maxLength 2000
       */
      value: string;
      /**
       * @minLength 1
       * @maxLength 70
       */
      model: string;
    }
  | {
      field: CustomCheckFields;
      rule: "llm_score";
      /**
       * @minLength 1
       * @maxLength 2000
       */
      value: string;
      /**
       * @minLength 1
       * @maxLength 70
       */
      model: string;
      failWhen: CustomCheckFailWhen;
    };

export type CustomCheckRules = CustomCheckRule[];

export type CheckPrecondition =
  | {
      field: CustomCheckFields;
      rule: "contains";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "not_contains";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "matches_regex";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
    }
  | {
      field: CustomCheckFields;
      rule: "is_similar_to";
      /**
       * @minLength 1
       * @maxLength 500
       */
      value: string;
      /**
       * @minimum 0
       * @maximum 1
       */
      openai_embeddings?: number[];
      threshold: number;
    };

export type CheckPreconditions = CheckPrecondition[];
