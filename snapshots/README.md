# Snapshots

Before Atlas changes a file it saves a copy in `snapshots/<task id>/`. To undo a change, copy the snapshot back and run `node site/build.mjs`.
