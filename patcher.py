import os

files = [
    'client/src/usersGrid/sections/PartnersSectionNew.tsx',
    'client/src/usersGrid/sections/TipersSectionNew.tsx'
]

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    target = "{ state: newValue }"
    repl = "{ state: params.newValue }"

    if target in content:
        content = content.replace(target, repl)
        content = content.replace("{ [field]: newValue }", "{ [field]: params.newValue }")
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {path}")
    else:
        print(f"Could not find target in {path}")
