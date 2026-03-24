# Skill → Agent Refactor Design

**Goal:** Rename all "Skill" concepts to "Agent" throughout the codebase — code symbols, file/directory names, storage keys, and UI text.

**Architecture:** Batch search-and-replace approach. All 14 affected files updated in one pass using rename rules, then `npm run build` validates correctness. Storage keys `customSkills` and `skillDisabledTools` are replaced directly (no migration — dev-stage data loss acceptable).

---

## Symbol Rename Rules

| Old | New |
|-----|-----|
| `Skill` | `Agent` |
| `skill` | `agent` |
| `skills` | `agents` |
| `SkillsPanel` | `AgentsPanel` |
| `activeSkillId` | `activeAgentId` |
| `customSkills` | `customAgents` |
| `skillDisabledTools` | `agentDisabledTools` |
| `setSkillDisabledTools` | `setAgentDisabledTools` |
| `buildSkillSystemPrompt` | `buildAgentSystemPrompt` |
| `getAllSkills` | `getAllAgents` |
| `BUILTIN_SKILLS` | `BUILTIN_AGENTS` |
| `loadCustomSkills` / `saveCustomSkills` | `loadCustomAgents` / `saveCustomAgents` |
| `loadSkillDisabledTools` / `saveSkillDisabledTools` | `loadAgentDisabledTools` / `saveAgentDisabledTools` |

## File/Directory Renames

| Old | New |
|-----|-----|
| `src/lib/skills/` | `src/lib/agents/` |
| `src/overlay/components/SkillsPanel.tsx` | `src/overlay/components/AgentsPanel.tsx` |

## Storage Key Changes

- `customSkills` → `customAgents` (direct replace, old data discarded)
- `skillDisabledTools` → `agentDisabledTools` (direct replace)

## UI Text Changes

- All occurrences of "技能" / "Skill" in UI → "Agent"
- "⚡ Skills" button → "⚡ Agents"
- Panel titles, placeholders, labels updated accordingly

## Affected Files (14)

1. `src/lib/skills/index.ts` → `src/lib/agents/index.ts`
2. `src/lib/skills/builtin/seo.ts` → `src/lib/agents/builtin/seo.ts`
3. `src/lib/skills/builtin/code.ts` → `src/lib/agents/builtin/code.ts`
4. `src/lib/skills/builtin/form.ts` → `src/lib/agents/builtin/form.ts`
5. `src/lib/skills/builtin/data.ts` → `src/lib/agents/builtin/data.ts`
6. `src/lib/skills/builtin/a11y.ts` → `src/lib/agents/builtin/a11y.ts`
7. `src/lib/skills/builtin/shopping.ts` → `src/lib/agents/builtin/shopping.ts`
8. `src/lib/skills/builtin/browser.ts` → `src/lib/agents/builtin/browser.ts`
9. `src/lib/skills/builtin/apidoc.ts` → `src/lib/agents/builtin/apidoc.ts`
10. `src/lib/storage.ts`
11. `src/overlay/store.ts`
12. `src/overlay/components/ChatPanel.tsx`
13. `src/overlay/components/SkillsPanel.tsx` → `AgentsPanel.tsx`
14. `src/overlay/components/SettingsPanel.tsx`

## Verification

- `npm run build` exits 0
