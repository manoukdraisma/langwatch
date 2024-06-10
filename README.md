![PyPI Version](https://img.shields.io/pypi/v/langwatch.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Discord](https://img.shields.io/discord/1227886780536324106?logo=discord&label=Discord)](https://discord.gg/kT4PhDS2gH)

# LangWatch

## LLMOps Platform | DSPy Visualizer | Monitoring | Evaluations | Analytics

LangWatch provides a suite of tools to track, visualize, and analyze interactions with LLMs focused on usability, helping both developers and non-technical team members to fine-tune performance and gain insights into user engagement.

[https://langwatch.ai](https://langwatch.ai)

![langwatch](https://github.com/langwatch/langwatch/assets/792201/cced066c-92a8-4348-8b84-d9707c6cfc4e)

## Features

- ⚡️ **Real-time Telemetry**: Capture detailed interaction tracings for analytics for LLM cost, latency, and so on for further optimization.
- 🐛 **Detailed Debugging**: Capture every step in the chain of your LLM calls, with all metadata and history, grouping by threads and user for easy troubleshooting and reproduction.
- 📈 **Make LLM Quality Measurable**: Stop relying on just feeling and use Evaluators to measure your LLM pipeline output quality with numbers using [LangEvals evaluators](https://github.com/langwatch/langevals/) to improve your pipelines, change prompts and switch models with confidence.
- 📊 [**DSPy Visualizer**](https://docs.langwatch.ai/dspy-visualization/quickstart): Go a step further into finding the best prompts and pipelines automatically with DSPy optimizers, and plug it into LangWatch DSPy visualizer to very easily inspect and track the progress of your DSPy experiments, keeping the history and comparing runs to keep iterating.
- ✨ **Easier \~Vibe Checking\~ too**: Even though LangWatch helps grounding the quality into numbers and run automated experiments, a human look is still as important as ever. A clean, friendly interface focused on usability with automatic topic clustering, so you can deep dive on the messages being generated and really get a deep understanding of how your LLM is behaving, finding insights to iterate.
- 🚀 **User Analytics**: Metrics on engagement, user interactions and more insights into users behaviour so you can improve your product.
- 🛡️ **Guardrails**: Detect PII leak with Google DLP, toxic language with Azure Moderation and many others LangWatch Guardrails available to monitor your LLM outputs and trigger alerts. Build custom Guardrails yourself with semantic matching or another LLM on top evaluating the response.

## Quickstart

Install LangWatch library:

```shell
pip install langwatch
```

Then simply wrap your LLM call with LangWatch tracer, no other code changes needed:

```diff
+ import langwatch.openai

+ with langwatch.openai.OpenAITracer(client):
      completion = client.chat.completions.create(
          model="gpt-3.5-turbo",
          messages=[
              {
                  "role": "system",
                  "content": "You are a helpful assistant that only reply in short tweet-like responses, using lots of emojis.",
              },
              {"role": "user", "content": message.content},
          ],
          stream=True,
      )
```

Next, you need to make sure to have LANGWATCH_API_KEY exported:

```bash
export LANGWATCH_API_KEY='your_api_key_here'
```

[Set up your project](https://app.langwatch.ai) on LangWatch to generate your API key.

For integration details of other LLMs and frameworks, refer our [documentation](https://docs.langwatch.ai/).

## DSPy Visualizer Quickstart

Install LangWatch library:

```shell
pip install langwatch
```

Import and authenticate with your LangWatch key:

```python
import langwatch

langwatch.login()
```

Before your DSPy program compilation starts, initialize langwatch with your experiment name and the optimizer to be tracked:

```python
# Initialize langwatch for this run, to track the optimizer compilation
langwatch.dspy.init(experiment="my-awesome-experiment", optimizer=optimizer)

compiled_rag = optimizer.compile(RAG(), trainset=trainset)
```

That's it! Now open the link provided when the compilation starts or go to your LangWatch dashboard to follow the progress of your experiments:

![DSPy Visualizer](https://github.com/langwatch/langwatch/assets/792201/47312dfe-980f-4c09-9610-67ad064cbe86)


## Local Development

You need to have docker and docker compose installed in your local environment to be able to run LangWatch locally.

1. Duplicate (or rename) [.env.example](./langwatch/.env.example) to .env or .env.local file

2. Add your Open AI key or Azure Open AI key for LLM guardrails capabilities and generating embeddings for the messages

```
# For embeddings and LLM guardrails, leave empty it if you don't want to use Azure
AZURE_OPENAI_ENDPOINT=""
AZURE_OPENAI_KEY=""
# Set OPENAI_API_KEY if you want to use OpenAI directly instead of Azure
OPENAI_API_KEY=""
```

3. Setup an [auth0](auth0.com) account (there should be a free plan and it should be more than enough).
    Create a simple app (for next.js) and take note of the credentials.
    You will use these credentials to update these env variables in .env file:

```
AUTH0_CLIENT_ID=""
AUTH0_CLIENT_SECRET=""
AUTH0_ISSUER="https://dev-yourapp.eu.auth0.com"
```

4. `docker compose up --build` should do the trick and get it working at http://localhost:3000

## Documentation

Detailed documentation is available to help you get the most out of LangWatch:

- [Introduction](https://docs.langwatch.ai/docs/intro)
- [Getting Started](https://docs.langwatch.ai/docs/getting-started)
- [OpenAI Python Integration](https://docs.langwatch.ai/docs/integration-guides/open-ai)
- [LangChain Python Integration](https://docs.langwatch.ai/docs/integration-guides/langchain)
- [Custom REST Integration](https://docs.langwatch.ai/docs/integration-guides/custom-rest)
- [Concepts](https://docs.langwatch.ai/docs/concepts)
- [Troubleshooting and Support](https://docs.langwatch.ai/docs/support)

## Self-Hosting

LangWatch is open-source, self-hosting docs are still coming soon, however if you are interested already, [please reach out to us](mailto:rogerio@langwatch.ai).

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please read our [Contribution Guidelines](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.
