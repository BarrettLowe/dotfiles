---
name: code-docs
version: 1.0.0
description: |
  Write down to earth code comments. Use when needing to add comments to classes, functions, methods etc. 
compatibility: claude-code
allowed-tools:
  - Read
  - Glob
  - Grep
---

The user wants you to add documentation to the code. This will be for functions, methods, or classes - NOT individual variables. 

## Rules:
- Do not use jargon - comments should read as if it is a conversation while whiteboarding a concept
- Do not include other contexts. BAD: "Takes the input from function YYY to convert to expected format" GOOD: "Converts from A format to B format."
- Use doxygen for C/C++ code. Docstrings for python.
- ONLY add comments for overall functions, methods, or classes. Do not comment on every line.
- DO NOT touch ANY code.

### C++ example
```cpp
/**
 * @brief Converts a GULP::LogLevel enum value to its canonical string representation.
 *
 * Always returns the canonical form regardless of any aliases used during parsing.
 * For example, both "print" and "comment" parse to Comment, but this will always
 * return "comment". Returns "unknown" for any unrecognized value.
 *
 * @param log_level  The GULP::LogLevel enum value to convert.
 * @return           The canonical lowercase string representation of the log level.
 */
inline std::string LogLevelToString(const GULP::LogLevel &log_level) {...
 ```

### Python example
```python
def calculate_velocity(distance: float, time: float) -> float:
    """Calculate the average velocity of a moving object.

    This function divides total distance by elapsed time to determine 
    the rate of motion. 

    Args:
        distance (float): The total distance traveled in meters.
        time (float): The total time taken in seconds.

    Returns:
        float: The average velocity in meters per second (m/s).

    Raises:
        ValueError: If time is less than or equal to zero.
    """
    if time <= 0:
        raise ValueError("Time must be greater than zero.")
    return distance / time
```
