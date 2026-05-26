# bug-loop

Launch the full workflow for "taking care of" bugs. Meant for relatively small issues.

## What You Must Do When Invoked

1. Determine what overview context will be needed by a bug investigator. Do not go searching for more context than you already have. Good things to pass to the bug investigator are ticket description, discoveries from the current session that pertain to the bug, or direct knowledge the user passed in. Send this information to the bug investigator agent and ask it to identify a fix - not exact code necessarily but the root cause should be completely identified.

2. Briefly review the output of the investigator and pass off to the bug fixer if valid - if not valid, stop and tell me. The bug fixer is a haiku model so be sure it's job is clear-cut. IF the fix is <5 lines, skip and do this step yourself.

3. Once the bug fixer has completed, pass off to the bug verifier to ensure that the issue was completely fixed. If the bug identifier reproduced the bug (which it should've) pass the reproduction steps or script in when the bug verifier is envoked so it has a goal. If the fixer needs SUBSTANITIVE changes, stop and tell the user before continuing.

4. If the required fixes were more than a few lines, run the simplifier agent on the changes.

5. Once all subagents are done, do a quick sanity check on the outputs of the agents to verify that the bug seems to be tracked through from start to finish reasonably and logically. Verify that tests have been run and written. If you deem any agent needs to be re-run, do it now.

6. Complete the task - if an issue(s) was referenced in this bug, make any comments on it that may be useful in the future and close the issue. 

## STOP If:

1. The agents are finding conflicting data
2. You are unsure of what to do
3. Tests cannot pass in 3 attempts (loop is stuck)
4. The bug is a large refactor
