# persistence-disable

🔌 **Disable persistent state management and return to in-memory-only caching** - Turn off persistence.

Safely deactivates file-based persistence and optionally deletes existing cache data files. After disabling, XC-MCP operates with in-memory caching only, losing all learned state on server restart. Useful for privacy requirements, disk space constraints, or troubleshooting cache-related issues.

## Advantages

• Meet privacy requirements that prohibit persistent storage
• Free up disk space when storage is limited
• Switch to CI/CD mode where persistence isn't beneficial
• Troubleshoot issues potentially caused by stale cached data

## Parameters

### Required
- (None)

### Optional
- clearData (boolean): Whether to delete existing cache files when disabling. Defaults to false

## Returns

- Tool execution results with persistence deactivation confirmation
- Confirmation of whether cache files were cleared
- Previous storage information (if clearData was true)
- Operational effect description

## Related Tools

- persistence-enable: Turn on persistence
- persistence-status: View persistence system status

## Notes

- Tool is auto-registered with MCP server
- Defaults to keeping cache files (just stopping writes)
- Set clearData: true to delete all cache files
- Operation is immediate and irreversible

