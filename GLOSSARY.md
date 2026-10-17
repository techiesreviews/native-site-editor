# Session and Agent Workspace Language

Terms for the editor's sign-in and agent-work lifetimes. Existing site and editing vocabulary remains in [CONTEXT.md](CONTEXT.md).

## Language

**Sign-in session**:
The authenticated period associated with one signed-in GitHub account in the editor.
_Avoid_: Session when referring to temporary agent work.

**Editor workspace**:
The repository, branch and unsaved changes being worked on in the editor.
_Avoid_: Session when referring to the open site and its drafts.

**Temporary agent data**:
The shared working information used by agents to understand a workspace, exchange requests and propose edits.
_Avoid_: Sign-in data, saved website.

**Disconnect grace period**:
The period during which temporary agent data is retained after the last editor connection ends, allowing a timely reconnection to preserve that work.
_Avoid_: Sign-in lifetime.

**Edit receipt**:
A record of an agent edit's completed outcome, used to check what happened when its response is lost and to avoid applying the same edit twice.
_Avoid_: GitHub save confirmation.
