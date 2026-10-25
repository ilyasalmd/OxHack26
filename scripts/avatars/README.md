# Sample profile photos

One picture per sample person from `scripts/seed-content.ts`, painted by `make.py` with Pillow:
gradients, polygons and blur, no photographs or third-party assets, so there is nothing to
license or credit. 384×384 JPEG, 4–18 KB each.

`npm run seed` encrypts each file with that person's profile key and shares the key with
everyone they chat with, exactly as the app does when you upload your own photo. A new account
that joins the sample chats in demo mode gets those keys too (see `lib/demo.ts`).

Re-draw after editing `make.py`:

    python3 scripts/avatars/make.py
