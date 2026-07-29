# push-and-flash

Run `push-and-flash.sh` from the repo root in the background so Barrett can see live output. The script is self-contained and handles the full workflow.

## Steps

1. Confirm the current directory is the SplitMelano repo and the branch is not `main`. If it is `main`, stop and tell the user to switch branches.

2. Run the script in the background using the Bash tool with `run_in_background: true`:
   ```
   ./push-and-flash.sh 2>&1 | tee /tmp/push-and-flash.log
   ```

3. Tell the user what's happening and that they'll be notified when it's ready to flash. Remind them of the bootloader entry methods:
   - NAV layer → left thumb cluster → `QK_BOOT`
   - Short the reset pads on the PCB

4. When the background task completes or the user asks for status, read `/tmp/push-and-flash.log` and report a summary.

## If gh CLI is not authenticated

Tell the user to run `! gh auth login` in the prompt.

## If the flash loop is stuck

The bootloader (Caterina) survives failed flashes — it's in protected flash. Tell the user to just trigger bootloader mode again. If the keyboard is completely unresponsive (won't enumerate at all), short the reset pads while plugged in to force bootloader entry.
