from dotenv import load_dotenv

from langwatch.types import RAGChunk

load_dotenv()

import chainlit as cl
from langchain.prompts import ChatPromptTemplate
from langchain.schema import HumanMessage
from langchain.schema.runnable.config import RunnableConfig

import sys

sys.path.append("..")
import langwatch.langchain

from langchain_community.document_loaders import WebBaseLoader
from langchain_community.vectorstores.faiss import FAISS
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.tools.retriever import create_retriever_tool
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.tools import BaseTool, StructuredTool, tool

loader = WebBaseLoader("https://docs.langwatch.ai")
docs = loader.load()
documents = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200
).split_documents(docs)
vector = FAISS.from_documents(documents, OpenAIEmbeddings())
retriever = vector.as_retriever()


@cl.on_chat_start
async def on_chat_start():
    retriever_tool = create_retriever_tool(
        langwatch.langchain.capture_rag_from_retriever(
            retriever,
            lambda document: RAGChunk(
                document_id=document.metadata["source"],
                content=document.page_content
            ),
        ),
        "langwatch_search",
        "Search for information about LangWatch. For any questions about LangWatch, use this tool if you didn't already",
    )

    # wrapped_tool = langwatch.langchain.capture_rag_from_tool(
    #     retriever_tool, lambda response: [RAGChunk(content=response)]
    # )

    tools = [retriever_tool]
    model = ChatOpenAI(streaming=True)
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful assistant that only reply in short tweet-like responses, using lots of emojis and use tools only once.\n\n{agent_scratchpad}",
            ),
            ("human", "{question}"),
        ]
    )
    agent = create_tool_calling_agent(model, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    cl.user_session.set("agent", executor)


@cl.on_message
async def main(message: cl.Message):
    agent: AgentExecutor = cl.user_session.get("agent")  # type: ignore

    msg = cl.Message(content="")

    with langwatch.langchain.LangChainTracer(
        metadata={"customer_id": "customer_example", "labels": ["v1.0.0"]}
    ) as langWatchCallback:
        async for chunk in agent.astream(
            {
                "question": message.content,
                "messages": [HumanMessage(content="Hoi, dit is een test")],
            },
            config=RunnableConfig(
                callbacks=[cl.LangchainCallbackHandler(), langWatchCallback]
            ),
        ):
            if "output" in chunk:
                await msg.stream_token(chunk["output"])
            elif "actions" in chunk:
                await msg.stream_token(chunk["actions"][0].log)
            elif "steps" in chunk:
                await msg.stream_token(chunk["steps"][0].observation + "\n\n")
            else:
                await msg.stream_token("<unammaped chunk>")

    await msg.send()
