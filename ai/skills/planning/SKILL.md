---
name: planning
description: |
  Plan a task, feature, or goal and render it as a hand-crafted dark-theme HTML
  artifact.
model: gpt-5.6-sol
---

Understand what the task is and why it needs to get done - this is crucial. If you do not know, stop and ask for clarification. 

Is the task big, or is it small?

Small tasks don't require but a few steps. Do not overplan small tasks but verify that the task doesn't have subtle wide-reaching affects.

Large tasks should be carefully planned like below.

## Process

When planning large changes to code, I like to start by comparing what exists to what functionality is needed. I break that down into individual pieces or deliverables. I look at those pieces and see where the biggest risk is - what could cause everything to fail or what has the potential to alter the plan entirely. I plan to work that piece first to ensure the risks for the remainder of the task are minimal. 

After I'm confident in the task, I'll try and pick a tracer bullet - something small that can travel through the whole system to prove out the flow/design and get a deliverable as early as possible - the easiest on possible. I'll adjust a little bit as needed if the system doesn't work but once happy, I'll usually do then hardest thing and see how that's handled. Again, tweak as necessary. Once the simplest and hardest things are in, ther rest is usually just filling out.

1. Understand the problem. What is being asked and why. If you don't know - stop and ask.
2. Walk backwards from the goal and identify steps, stages, phases, files, classes, changes - whatever is needed to get there from the current state. This step is somewhat abstract (eg. We need two things to talk to eachother to exchange data. Note how we think in "things" here without specifying any details.)
3. Investigate the existing state of the project as it pertains to this task.
4. Refine the pieces from step 2 with the current project in mind. It may or may not change.
5. Identify the biggest risk or unknown. 
6. Perform a risk-reduction task to remove the risk/unknown.
7. Re-plan or raise issues after risk-reduction
8. Fill out skeleton of the system (class headers, functions, etc) to check interfaces/datatypes between things
9. Pick a tracer bullet - something small to work towards to test the framework of the system and gain fast feedback on the design
10. Build the tracer
11. Refine the plan with anything learned from the tracer
12. Build remaining pieces, possibly as tracers as well if the task is sufficiently large or complicated

