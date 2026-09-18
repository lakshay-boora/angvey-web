# ANGVEY

Operator command center — single-page app + Vercel serverless APIs.

## Env vars (Vercel)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | **Yes** | Chat |
| `GROQ_MODEL` | No | Model id |
| `TAVILY_API_KEY` | No | Search |
| `RESEND_API_KEY` | No | Email digests |
| `RESEND_FROM` | No | From address |
| `DIGEST_EMAILS` | No | Cron recipients |
| `DIGEST_WEBHOOK` | No | Subscriber webhook |
| `CRON_SECRET` | No | Protect cron |

Cron: daily 03:00 UTC → `/api/cron/digest`
