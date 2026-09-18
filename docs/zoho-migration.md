# Zoho CRM migration

The migration tool imports one related Zoho export set into the CRM.

| Zoho export | CRM destination |
| --- | --- |
| Accounts | Companies |
| Contacts | Contacts |
| Deals | Deals and deal contacts |
| Leads | Lead board |
| Notes | Note activities |
| Calls | Call activities |
| Tasks | Task activities |
| Users | Owner matching only |

Zoho users are matched to CRM members by email. The tool does not create login
accounts or passwords from the Users export.

## Before importing

1. Add employees through the sign-up process.
2. Confirm their email addresses match the Zoho Users export.
3. Export all eight CSV files on the same day.
4. Keep the original Zoho filenames in one folder.
5. Back up the production database.

## Validate without changing data

```sh
bun run zoho:import -- --dir /path/to/zoho-export
```

The default mode reads the files and database, then prints aggregate counts.
It does not change records.

## Commit the import

```sh
bun run zoho:import -- --dir /path/to/zoho-export --commit
```

Use `--fallback-user employee@example.com` when imported deals and activities
must use a specific CRM member for unmatched Zoho owners.

The importer is repeatable. It matches leads and activities by Zoho ID. It
matches companies, contacts, and deals by their stable business fields.
