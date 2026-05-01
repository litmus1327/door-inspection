# Development Notes

## User Preferences
- **Zip File Delivery**: After each change/checkpoint, provide a zipped folder of all updated files (excluding node_modules, .git, dist, .manus-logs, *.log)

## Recent Changes
- Fixed 60-minute minimum rating warning to only apply to 1-hour fire barriers when Stair Door is ON
- Updated rating validation useEffect to check hwState.hw_stair_door condition
- Added dual egress smoke barrier exception (0 minimum rating)
