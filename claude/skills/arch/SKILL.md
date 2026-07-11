---
name: architecture-design
description: This skill defines how to work with the user to design an architecture. Use any time a new feature or refactor is being developed.
model: opus
---

# /arch

Collaborate with the user to develop an object oriented (OO) software architecture that suits the problem at hand. The goal is to establish a "shape" for the code that will be written soon. 

## Steps
### Prerequisites
1. Do you understand the system or subsystem? If not, ask questions.
2. Is this task too large? If so, break it down and suggest it be split - then stop.

### High Level Arch

From a high level, think about the problem and identify the high level interfaces or components necessary to perform the high level tasks. Present the user with 3 options for how to structure the solution.

**Example**
Problem: We need something that intercepts incoming messages and, if the system is bogged down (some criteria) we prioritize the higher priority messages, discarding the rest.

Given this problem you may identify 3 options
- Priority queue with eviction using an Interceptor, PriorityClassifier, and Dispatcher
- Pipeline with Pluggable Stages - (Interceptor -> Classifier -> Shedder (remove low priority messages) -> LoadMonitor (assess consumer load)
- Mediator/Broker with Tiered Queues + Explicit State Machine

For each option, list the following:
- Description
- Pros
- Cons
- OOP Pattern(s) Used

### Confirm Design
Prompt the user for what direction he leans. Then delve a bit deeper to confirm. Present a bit more depth to the architecture.
- Suggested file tree/class breakdown eg.
    <Dir>
        <FileA>
            <Class> - <Class responsibility>
            <Class> - <Class responsibility>
        <FileB>
            <Class> - <Class responsibility>
- Explanation of the primary classes eg.
    ClassA is primarily a class that houses the data and feeds it to ClassB but putting the data directly in ClassB makes testing difficult because the everything would have to include ClassB - which we don't want.
    ClassB is what transforms the incoming data into something usable in the pipeline. It does this using abstract ClassCs which can easily be added to the ClassB's transformations library.

If necessary, you may even list out the public interfaces for the classes. 

List any hesitations you have about the design. Be adversarial but not argumentative - this is meant to bolster it.

**This is the decision point** 
At this stage in the process, if more information is needed, the user will ask for it. Once the user decides on this option (or asks to review other options) it's time to think out the full design.

### Finalize Design
After the user has chosen the high level design, start filling in the lower level pieces. Ask the user questions one at a time to fill any gaps or anticipate future functionality or assess testing feasibility. Ask questions until you have a full picture and are certain that you and the user are COMPLETELY aligned. Then create a markdown Architecture Description Document (ADD) that includes:
- System/subsystem description
- Where this feature/refactor plugs in - where/how it gets invoked
- UML Diagram (mermaid)
- All classes and the public interfaces that need to exist in them (almost like a C++ header file) and what the input/outupt of the functions are (description for an implementer)

### Conclusion

End with a suggestion to the user of what to build first to prove this design out or test it. It should be a tracer task (think tracer bullets or slice of a cake vs layer). Before making the suggestion, consider the weak points in the design that are inflexible, have uncertain inputs, high variation, or are in any othe way suceptable to fail. However, don't make your suggestion based off one niche case.
