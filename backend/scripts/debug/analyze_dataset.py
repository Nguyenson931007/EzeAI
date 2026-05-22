"""Analyze dataset class distribution."""
import os
from collections import Counter
import yaml

label_dir = r'd:\Copy_test\EzeFloor-main\backend\dataset\train\labels'
class_counter = Counter()
total_polys = 0
files_with_labels = 0
files_without_labels = 0

for f in os.listdir(label_dir):
    if not f.endswith('.txt'):
        continue
    with open(os.path.join(label_dir, f), 'r') as fp:
        lines = [l.strip() for l in fp if l.strip()]
        if lines:
            files_with_labels += 1
        else:
            files_without_labels += 1
        for line in lines:
            parts = line.split()
            if len(parts) >= 5:
                cid = int(parts[0])
                class_counter[cid] += 1
                total_polys += 1

# Load class names
with open(r'd:\Copy_test\EzeFloor-main\backend\dataset\data.yaml', 'r') as fp:
    data = yaml.safe_load(fp)
names = data.get('names', {})
nc = data['nc']

print(f"Total label files: {files_with_labels + files_without_labels}")
print(f"  With annotations: {files_with_labels}")
print(f"  Empty: {files_without_labels}")
print(f"Total polygon annotations: {total_polys}")
print(f"Unique classes used: {len(class_counter)} / {nc}")
print()
print("Class distribution (sorted by count):")
for cid, count in sorted(class_counter.items(), key=lambda x: -x[1]):
    name = names.get(cid, f'class_{cid}')
    pct = count / total_polys * 100
    bar = "#" * int(pct)
    print(f"  [{cid:2d}] {name:15s}: {count:4d} ({pct:5.1f}%) {bar}")

print()
print("Classes with 0 samples:")
for cid in range(nc):
    if cid not in class_counter:
        name = names.get(cid, f'class_{cid}')
        print(f"  [{cid:2d}] {name}")

# Also check validation set
print("\n\n=== Validation Set ===")
val_dir = r'd:\Copy_test\EzeFloor-main\backend\dataset\valid\labels'
val_counter = Counter()
val_total = 0
for f in os.listdir(val_dir):
    if not f.endswith('.txt'):
        continue
    with open(os.path.join(val_dir, f), 'r') as fp:
        for line in fp:
            parts = line.strip().split()
            if len(parts) >= 5:
                cid = int(parts[0])
                val_counter[cid] += 1
                val_total += 1

print(f"Total val annotations: {val_total}")
for cid, count in sorted(val_counter.items(), key=lambda x: -x[1]):
    name = names.get(cid, f'class_{cid}')
    pct = count / val_total * 100
    print(f"  [{cid:2d}] {name:15s}: {count:4d} ({pct:5.1f}%)")
