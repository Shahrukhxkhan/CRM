# Contact CSV Import and Export

SoloFlow exports contacts using the following stable header order. The exported file can be edited and imported back into the same owner-scoped workspace.

| Header | Required | Import rule |
|---|---:|---|
| `name` | Yes | Non-empty contact name. |
| `email` | No | Must be a valid email when supplied. |
| `phone` | No | Free-form contact phone number. |
| `company` | No | Links to an existing same-owner company by name or creates a same-owner company when absent. |
| `source` | No | Free-form origin, such as referral or website. |
| `estimated_value` | No | A non-negative numeric amount. |
| `stage` | No | One of `new`, `contacted`, `qualified`, `proposal`, `won`, or `lost`; defaults to `new`. |
| `tags` | No | Separate multiple tags with semicolons, for example `priority;design`. |
| `notes` | No | Free-form contact notes. |

Import accepts comma-separated values with quoted fields, including commas and escaped quotes inside a field. A file may contain at most **1,000 rows** and be no larger than **1 MB**. All rows are validated before database writes begin: if any row is invalid, no rows from that upload are imported. Imported contacts, companies, and tags always receive the authenticated user’s owner scope; one user’s CSV action cannot access another user’s data.
