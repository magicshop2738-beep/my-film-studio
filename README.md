# My AI Film Studio — Database

This folder stores the studio's persistent data.

## Database files

The backend automatically creates and manages these JSON files:

- `projects.json` — Film projects and their details.
- `characters.json` — Saved characters and their descriptions.
- `library.json` — Saved characters, locations, objects, and reusable elements.
- `uploads.json` — Records of uploaded media files.

## Storage

Uploaded images, videos, audio, and reference files are stored separately in the main `uploads` folder.

## Important

- Do not manually delete database files.
- Keep backups of important studio data.
- Database files are managed by the backend.
- The database folder must remain available while the studio is running.

## Future expansion

The database can later be upgraded to a dedicated database system while preserving the studio's existing features.