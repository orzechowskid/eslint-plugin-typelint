---
name: Bug report
about: Create a report to help us improve
title: ''
labels: ''
assignees: ''

---

**snippet of incorrectly-linted code**
Please paste here the shortest possible code snippet which exhibits the problem.

**typelint config**
you can run the command `eslint --print-config <my_source_file.js>  | grep -A 4 typelint` and then paste the configuration for the specific rule in question.

**expected behavior**
describe what should have (or should not have) happened instead.

**package versions**
please include what version of eslint and typeline you're using.

**issue checklist**

- [ ] I included the smallest-possible code snippet above
- [ ] I provided the typelint config for the applicable rule above
- [ ] I marked this checkbox as done because I don't pay attention
- [ ] I described the expected behavior above
- [ ] I provided the versions of eslint and typeline currently in use

thanks for taking the time to follow the above steps; it really helps me avoid a lot of back-and-forth and allows me to locate and fix the issue more quickly!
