import asyncio
import os
from typing import Dict, List, Optional, Union
from dotenv import load_dotenv
from mangum import Mangum

from langwatch_nlp.generate_proxy_config import generate_proxy_config

load_dotenv()

import langwatch_nlp.error_tracking
from fastapi import FastAPI


import langwatch_nlp.topic_clustering.batch_clustering as batch_clustering
import langwatch_nlp.topic_clustering.incremental_clustering as incremental_clustering
import langwatch_nlp.sentiment_analysis as sentiment_analysis
import litellm.proxy.proxy_server as litellm_proxy_server

from litellm.router import Router

# Config
app = FastAPI()
batch_clustering.setup_endpoints(app)
incremental_clustering.setup_endpoints(app)
sentiment_analysis.setup_endpoints(app)


async def proxy_startup():
    os.environ["AZURE_API_VERSION"] = "2024-02-01"
    original_get_available_deployment = Router.async_get_available_deployment

    # Patch to be able to replace api_key and api_base on the fly from the parameters comming from langwatch according to user settings
    async def patched_get_available_deployment(
        self,
        model: str,
        messages: Optional[List[Dict[str, str]]] = None,
        input: Optional[Union[str, List]] = None,
        specific_deployment: Optional[bool] = False,
        request_kwargs: Optional[Dict] = None,
        **kwargs
    ):
        self.cache.flush_cache()  # prevents litellm proxing from storing failures and mark the deployment as "unhealthy" for everyone in case a single user's API key is invalid for example

        deployment = await original_get_available_deployment(
            self,
            model=model,
            messages=messages,
            input=input,
            specific_deployment=specific_deployment,
            request_kwargs=request_kwargs,
            **kwargs
        )
        deployment = deployment.copy()

        if "litellm_params" not in deployment:
            deployment["litellm_params"] = {}
        if request_kwargs is not None and "proxy_server_request" in request_kwargs:
            proxy_server_request = request_kwargs["proxy_server_request"]
            for header, value in proxy_server_request["headers"].items():
                if header.startswith("x-litellm-"):
                    _, key = header.split("x-litellm-")
                    key = key.replace("-", "_")
                    deployment["litellm_params"][key] = value
        if "azure/" in model:
            deployment["litellm_params"]["api_version"] = os.environ[
                "AZURE_API_VERSION"
            ]
        self.set_client(model=deployment)

        return deployment

    Router.async_get_available_deployment = patched_get_available_deployment

    litellm_proxy_server.ProxyConfig()
    generate_proxy_config()
    litellm_proxy_server.save_worker_config(config="proxy_config.generated.yaml")
    app.mount("/proxy", litellm_proxy_server.app)
    await litellm_proxy_server.startup_event()


if os.getenv("PROXY_IS_ENABLED") == "1":
    loop = asyncio.get_event_loop()
    if not loop.is_running():
        loop.run_until_complete(proxy_startup())
    else:
        asyncio.ensure_future(proxy_startup())

if __name__ != "__main__":
    handler = Mangum(app, lifespan="off")
