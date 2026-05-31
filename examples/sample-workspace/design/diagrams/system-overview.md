# System Overview

A sample local-first web service architecture used to explore AgentCanvas.

```mermaid
flowchart LR
  subgraph group_backend["Backend"]
    node_api_gateway["API Gateway"]
    node_auth_service["Auth Service"]
    node_user_service["User Service"]
    node_redis_cache[("Redis Cache")]
    node_postgresql[("PostgreSQL")]
    node_job_queue["Job Queue"]
    node_worker("Worker")
  end

  node_client(("Client"))
  node_web_app("Web App")
  node_payment_api>"External Payment API"]

  node_client --> node_web_app
  node_web_app --> node_api_gateway
  node_api_gateway --> node_auth_service
  node_api_gateway --> node_user_service
  node_user_service --> node_redis_cache
  node_user_service --> node_postgresql
  node_user_service --> node_job_queue
  node_job_queue --> node_worker
  node_worker --> node_payment_api
```

## Tasks

- [ ] Auth Service の codeRef を追加 (todo)
- [ ] Redis fallback設計を書く (todo)
- [ ] Worker retry policy を決める (todo)

## Notes

- warning: RedisのTTL方針が未定義
- risk: Payment API失敗時のretry/backoffが必要

## Comments

No comments.
