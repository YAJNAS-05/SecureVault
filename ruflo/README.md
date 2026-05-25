# `ruflo/` — multi-agent swarm configuration

This directory holds the [ruflo](https://github.com/ruvnet/ruflo) configuration
that builds (and can extend) SQLInsight as a coordinated **multi-agent swarm**.

| File | Purpose |
|---|---|
| `swarm.config.json` | swarm definition: topology, agent roster, owned dirs, hooks, task DAG |
| `bootstrap.sh` | one-shot script: `swarm_init` + `memory_store` + `agent_spawn …` |
| `contracts/api.json` | the frozen API/DB contract shared via memory so agents build in parallel |
| `agents/*.md` | per-agent task briefs (researcher, ml, backend, frontend, docs, security, QA) |

## Use it

```bash
# install + register ruflo first (see ../docs/RUFLO_GUIDE.md)
npx ruflo@latest init
claude mcp add ruflo -- npx ruflo@latest mcp start

# launch the swarm
bash ruflo/bootstrap.sh
ruflo swarm status
```

The design rationale, topology diagram, and task DAG are in
[`../docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md).

> Reminder: ruflo is the **development orchestration** layer. To merely *run*
> SQLInsight you don't need it — see
> [`../docs/DEPLOYMENT_MAC.md`](../docs/DEPLOYMENT_MAC.md).
