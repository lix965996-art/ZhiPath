from __future__ import annotations

import json
import logging
import math
import re
import uuid
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from services.database import get_db
from services.models import DocumentChunkModel, DocumentModel
from services.rag.embeddings import get_embeddings

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "knowledge"
DOCUMENTS_FILE = DATA_DIR / "documents.json"

SEED_DOCUMENTS = [
    {
        "title": "Python 变量与数据类型详解",
        "content": (
            "## 变量与赋值\n"
            "Python 是动态类型语言，变量不需要声明类型，赋值即创建：\n\n"
            "```python\n"
            "name = 'Alice'      # str\n"
            "age = 25            # int\n"
            "score = 92.5        # float\n"
            "passed = True       # bool\n"
            "```\n\n"
            "变量名规则：字母/下划线开头，区分大小写，不能用关键字（如 if、class、return）。\n\n"
            "## 基本数据类型\n"
            "- **int**：整数，Python 3 中无上限，`10 ** 100` 也不会溢出。\n"
            "- **float**：浮点数，注意精度问题：`0.1 + 0.2 == 0.30000000000000004`，需要用 `round()` 或 `decimal` 模块处理。\n"
            "- **str**：字符串，不可变。单引号双引号等价。三引号支持多行。f-string 格式化：`f'{name}得了{score}分'`。\n"
            "- **bool**：只有 `True` / `False`，是 int 的子类（`True == 1`）。\n\n"
            "## 容器类型\n"
            "- **list**：有序可变序列，`[1, 2, 3]`。支持索引、切片、append、pop、sort。\n"
            "- **tuple**：有序不可变序列，`(1, 2, 3)`。常用作字典键或函数返回多值。\n"
            "- **dict**：键值对映射，`{'name': 'Alice', 'age': 25}`。Python 3.7+ 保持插入顺序。\n"
            "- **set**：无序不重复集合，`{1, 2, 3}`。支持交集 `&`、并集 `|`、差集 `-`。\n\n"
            "## 类型转换\n"
            "```python\n"
            "int('42')        # str -> int\n"
            "str(3.14)        # float -> str\n"
            "list('hello')    # str -> list  得到 ['h','e','l','l','o']\n"
            "float('inf')     # 正无穷\n"
            "```\n\n"
            "## 常见错误\n"
            "1. `NameError: name 'x' is not defined` — 变量未赋值就使用。\n"
            "2. `TypeError: 'tuple' object does not support item assignment` — 尝试修改元组。\n"
            "3. `is` vs `==`：`is` 比较身份（内存地址），`==` 比较值。`[1,2] == [1,2]` 为 True，但 `[1,2] is [1,2]` 为 False。\n\n"
            "## 练习建议\n"
            "用 `type()` 函数检查各种字面量的类型；尝试 `a = [1,2,3]; b = a; b.append(4); print(a)` 理解引用机制。"
        ),
        "tags": ["Python基础", "变量", "数据类型", "list", "dict"],
    },
    {
        "title": "Python 条件判断与分支逻辑",
        "content": (
            "## if / elif / else 基本语法\n"
            "```python\n"
            "score = 85\n"
            "if score >= 90:\n"
            "    grade = 'A'\n"
            "elif score >= 80:\n"
            "    grade = 'B'\n"
            "elif score >= 70:\n"
            "    grade = 'C'\n"
            "else:\n"
            "    grade = 'D'\n"
            "```\n\n"
            "Python 用缩进（4个空格）表示代码块，没有花括号。`elif` 是 `else if` 的缩写。\n\n"
            "## 布尔运算\n"
            "- `and`：两边都为 True 才为 True。\n"
            "- `or`：任一边为 True 就为 True。\n"
            "- `not`：取反。\n"
            "- 短路求值：`a and b` 中如果 a 为 False，b 不会执行。\n\n"
            "## 隐式布尔转换\n"
            "以下值为假（falsy）：`None`、`0`、`0.0`、`''`、`[]`、`{}`、`()`、`set()`。其余都是真。\n\n"
            "```python\n"
            "items = []\n"
            "if not items:        # 等价于 if len(items) == 0\n"
            "    print('列表为空')\n"
            "```\n\n"
            "## 三元表达式\n"
            "```python\n"
            "status = '成年' if age >= 18 else '未成年'\n"
            "```\n"
            "语法：`值A if 条件 else 值B`，适合简单二选一，不要嵌套使用。\n\n"
            "## match-case（Python 3.10+）\n"
            "```python\n"
            "match command:\n"
            "    case 'start':\n"
            "        start_engine()\n"
            "    case 'stop':\n"
            "        stop_engine()\n"
            "    case _:\n"
            "        print('未知命令')\n"
            "```\n\n"
            "## 常见错误\n"
            "1. `=` vs `==`：`if x = 5` 会报语法错误，必须用 `if x == 5`。\n"
            "2. 忘记冒号：`if score > 90` 少写 `:` 是初学者最常犯的错误。\n"
            "3. 缩进不一致：混用空格和 Tab 会报 `TabError`。\n"
            "4. 链式比较的坑：`a < b < c` 等价于 `a < b and b < c`，不是 `(a < b) < c`。\n\n"
            "## 练习建议\n"
            "写一个成绩等级判断程序，输入 0-100 的分数，输出 A/B/C/D/F。扩展：处理非法输入（负数、超100、非数字）。"
        ),
        "tags": ["Python基础", "条件判断", "if", "elif", "布尔运算"],
    },
    {
        "title": "Python 循环结构全解",
        "content": (
            "## for 循环\n"
            "```python\n"
            "fruits = ['苹果', '香蕉', '橙子']\n"
            "for fruit in fruits:\n"
            "    print(fruit)\n"
            "```\n"
            "for 循环遍历任何可迭代对象（list、str、dict、range 等）。\n\n"
            "## range() 函数\n"
            "```python\n"
            "range(5)          # 0, 1, 2, 3, 4\n"
            "range(2, 8)       # 2, 3, 4, 5, 6, 7\n"
            "range(0, 10, 2)   # 0, 2, 4, 6, 8  (步长为2)\n"
            "range(10, 0, -1)  # 10, 9, 8, ..., 1  (倒序)\n"
            "```\n\n"
            "## enumerate 和 zip\n"
            "```python\n"
            "# 同时获取索引和值\n"
            "for i, fruit in enumerate(fruits):\n"
            "    print(f'{i}: {fruit}')\n\n"
            "# 同时遍历多个列表\n"
            "names = ['Alice', 'Bob']\n"
            "scores = [95, 87]\n"
            "for name, score in zip(names, scores):\n"
            "    print(f'{name}: {score}')\n"
            "```\n\n"
            "## while 循环\n"
            "```python\n"
            "n = 10\n"
            "while n > 0:\n"
            "    print(n)\n"
            "    n -= 1\n"
            "```\n"
            "while 适合循环次数不确定的场景，如等待用户输入、游戏主循环。\n\n"
            "## break / continue / else\n"
            "- `break`：立即跳出整个循环。\n"
            "- `continue`：跳过本次，进入下一次迭代。\n"
            "- `for...else`：循环正常结束（没有 break）时执行 else 块。\n\n"
            "```python\n"
            "# 找第一个能被7整除的数\n"
            "for i in range(100):\n"
            "    if i % 7 == 0:\n"
            "        print(i)\n"
            "        break\n"
            "```\n\n"
            "## 列表推导式\n"
            "```python\n"
            "squares = [x**2 for x in range(10)]\n"
            "evens = [x for x in range(20) if x % 2 == 0]\n"
            "matrix = [[i*3+j for j in range(3)] for i in range(3)]\n"
            "# 字典推导式\n"
            "word_len = {w: len(w) for w in ['hello', 'world', 'py']}\n"
            "```\n\n"
            "## 常见错误\n"
            "1. `for i in range(len(list))` 而非直接遍历 — 除非需要索引，否则直接 `for item in list`。\n"
            "2. 循环中修改列表导致跳过元素：删除元素时从后往前遍历。\n"
            "3. 死循环：`while True` 忘记 break 条件。\n"
            "4. `range()` 返回的是迭代器，不是列表 — `range(5)` 不等于 `[0,1,2,3,4]`，但可遍历。\n\n"
            "## 练习建议\n"
            "用嵌套循环打印九九乘法表；用列表推导式生成 100 以内所有素数；实现一个猜数字游戏（1-100，提示偏大偏小）。"
        ),
        "tags": ["Python基础", "循环", "for", "while", "range", "列表推导式"],
    },
    {
        "title": "Python 函数定义与参数",
        "content": (
            "## 函数定义\n"
            "```python\n"
            "def greet(name, greeting='你好'):\n"
            "    \"\"\"返回问候语字符串。\"\"\"\n"
            "    return f'{greeting}，{name}！'\n"
            "```\n\n"
            "## 参数类型\n"
            "```python\n"
            "def func(a, b, /, c, d=10, *args, key, **kwargs):\n"
            "    pass\n"
            "```\n"
            "- `a, b`：仅位置参数（`/` 左侧），不能 `func(a=1, b=2)`。\n"
            "- `c`：位置或关键字参数。\n"
            "- `d=10`：带默认值的参数，调用时可省略。\n"
            "- `*args`：收集多余的位置参数为元组。\n"
            "- `key`：仅关键字参数（在 `*args` 之后），必须 `func(..., key=val)`。\n"
            "- `**kwargs`：收集多余的关键字参数为字典。\n\n"
            "## 可变默认参数陷阱\n"
            "```python\n"
            "# 错误写法！\n"
            "def append_to(item, lst=[]):\n"
            "    lst.append(item)\n"
            "    return lst\n\n"
            "# 正确写法：\n"
            "def append_to(item, lst=None):\n"
            "    if lst is None:\n"
            "        lst = []\n"
            "    lst.append(item)\n"
            "    return lst\n"
            "```\n"
            "原因是默认值在函数定义时只创建一次，所有调用共享同一个列表对象。\n\n"
            "## 返回值\n"
            "- 无 return 等价于 `return None`。\n"
            "- 返回多值本质是返回元组：`return a, b` 等价于 `return (a, b)`。\n"
            "- 解包接收：`x, y = divmod(17, 5)`。\n\n"
            "## lambda 表达式\n"
            "```python\n"
            "square = lambda x: x ** 2\n"
            "sorted(names, key=lambda n: len(n))  # 按长度排序\n"
            "```\n"
            "lambda 只能包含单个表达式，不能有 if 语句块或赋值。复杂逻辑请用 def。\n\n"
            "## 作用域规则（LEGB）\n"
            "变量查找顺序：Local → Enclosing → Global → Built-in。\n"
            "```python\n"
            "x = 10          # Global\n"
            "def outer():\n"
            "    x = 20      # Enclosing\n"
            "    def inner():\n"
            "        x = 30  # Local\n"
            "        print(x)\n"
            "    inner()     # 打印 30\n"
            "```\n"
            "在函数内修改全局变量需要 `global x` 声明，否则会创建局部变量遮蔽。\n\n"
            "## 练习建议\n"
            "实现一个 `apply_operation(func, a, b)` 函数，传入不同的 lambda 执行加减乘除；写一个计数器闭包 `make_counter()` 返回一个每次调用递增的函数。"
        ),
        "tags": ["Python基础", "函数", "参数", "lambda", "作用域", "闭包"],
    },
    {
        "title": "Python 面向对象编程入门",
        "content": (
            "## 类的定义\n"
            "```python\n"
            "class Student:\n"
            "    school = 'ZhiPath Academy'  # 类属性，所有实例共享\n\n"
            "    def __init__(self, name, age):\n"
            "        self.name = name    # 实例属性\n"
            "        self.age = age\n"
            "        self._scores = []   # 约定为私有（单下划线惯例）\n\n"
            "    def add_score(self, score):\n"
            "        self._scores.append(score)\n\n"
            "    @property\n"
            "    def average(self):\n"
            "        return sum(self._scores) / len(self._scores) if self._scores else 0\n\n"
            "    def __repr__(self):\n"
            "        return f'Student({self.name}, age={self.age})'\n"
            "```\n\n"
            "## 继承与多态\n"
            "```python\n"
            "class GraduateStudent(Student):\n"
            "    def __init__(self, name, age, thesis_topic):\n"
            "        super().__init__(name, age)  # 调用父类初始化\n"
            "        self.thesis_topic = thesis_topic\n\n"
            "    def __repr__(self):\n"
            "        return f'Grad({self.name}, thesis={self.thesis_topic})'\n"
            "```\n"
            "- `super()` 调用父类方法。\n"
            "- 子类可以重写（override）父类方法，这是多态的基础。\n"
            "- `isinstance(obj, Student)` 检查类型，`issubclass(GraduateStudent, Student)` 检查继承关系。\n\n"
            "## 常用魔术方法\n"
            "| 方法 | 用途 | 示例 |\n"
            "|------|------|------|\n"
            "| `__init__` | 构造函数 | `Student('Alice', 20)` |\n"
            "| `__repr__` | 调试字符串 | `repr(s)` |\n"
            "| `__str__` | 用户友好字符串 | `str(s)` 或 `print(s)` |\n"
            "| `__len__` | `len()` 支持 | `len(obj)` |\n"
            "| `__getitem__` | 索引访问 | `obj[0]` |\n"
            "| `__eq__` | 相等比较 | `obj1 == obj2` |\n\n"
            "## 常见错误\n"
            "1. 忘记 `self`：方法第一个参数必须是 `self`。\n"
            "2. `__init__` 写成 `_init_`（单下划线）：不会报错但不会被调用。\n"
            "3. 可变类属性陷阱：`class Foo: items = []` 所有实例共享同一个列表。\n"
            "4. 在 `__init__` 之外直接在类体写 `self.xxx`：类体中不能使用 self。\n\n"
            "## 练习建议\n"
            "创建一个 `BankAccount` 类，支持存款、取款、查询余额；继承出 `SavingsAccount` 增加利率计算。实现 `__add__` 让两个账户可以合并。"
        ),
        "tags": ["Python基础", "面向对象", "class", "继承", "多态"],
    },
    {
        "title": "Python 异常处理与调试",
        "content": (
            "## try / except 基本用法\n"
            "```python\n"
            "try:\n"
            "    result = 10 / 0\n"
            "except ZeroDivisionError:\n"
            "    print('不能除以零！')\n"
            "except (TypeError, ValueError) as e:\n"
            "    print(f'类型或值错误: {e}')\n"
            "else:\n"
            "    print(f'成功，结果是 {result}')\n"
            "finally:\n"
            "    print('无论是否异常都会执行')\n"
            "```\n"
            "- `else` 块：没有异常时执行。\n"
            "- `finally` 块：无论是否异常都执行，常用于关闭文件、释放资源。\n\n"
            "## 常见异常类型\n"
            "| 异常 | 触发场景 |\n"
            "|------|----------|\n"
            "| `NameError` | 使用未定义的变量 |\n"
            "| `TypeError` | 操作类型不匹配，如 `'2' + 2` |\n"
            "| `ValueError` | 类型正确但值不合法，如 `int('abc')` |\n"
            "| `IndexError` | 索引超出范围，如 `[][0]` |\n"
            "| `KeyError` | 字典键不存在 |\n"
            "| `FileNotFoundError` | 打开不存在的文件 |\n"
            "| `AttributeError` | 对象没有该属性/方法 |\n"
            "| `ImportError` | 模块导入失败 |\n\n"
            "## 抛出异常\n"
            "```python\n"
            "def set_age(age):\n"
            "    if age < 0:\n"
            "        raise ValueError('年龄不能为负数')\n"
            "    return age\n"
            "```\n\n"
            "## 自定义异常\n"
            "```python\n"
            "class ExamError(Exception):\n"
            "    def __init__(self, subject, reason):\n"
            "        self.subject = subject\n"
            "        self.reason = reason\n"
            "        super().__init__(f'{subject}考试出错: {reason}')\n"
            "```\n\n"
            "## 调试技巧\n"
            "1. **print 大法**：最简单但效率低。\n"
            "2. **logging 模块**：比 print 好，可控制级别（DEBUG/INFO/WARNING/ERROR）。\n"
            "3. **pdb 断点调试**：在代码中插入 `import pdb; pdb.set_trace()`（Python 3.7+ 用 `breakpoint()`）。\n"
            "4. **traceback 模块**：`import traceback; traceback.print_exc()` 打印完整调用栈。\n\n"
            "## 常见错误\n"
            "1. 裸 `except:` 捕获所有异常（包括 KeyboardInterrupt），应该明确指定异常类型。\n"
            "2. `except Exception` vs `except BaseException`：后者会捕获 SystemExit 和 KeyboardInterrupt。\n"
            "3. 异常中修改状态：finally 中不要 return，它会吞掉 try 中的异常。\n\n"
            "## 练习建议\n"
            "写一个安全的除法函数，处理各种异常；实现一个重试装饰器 `@retry(n=3)`，失败时自动重试 n 次。"
        ),
        "tags": ["Python基础", "异常处理", "try", "调试", "pdb"],
    },
    {
        "title": "Python 文件操作与 IO",
        "content": (
            "## 文件读写基础\n"
            "```python\n"
            "# 读取整个文件\n"
            "with open('data.txt', 'r', encoding='utf-8') as f:\n"
            "    content = f.read()\n\n"
            "# 逐行读取（内存友好）\n"
            "with open('data.txt', 'r', encoding='utf-8') as f:\n"
            "    for line in f:\n"
            "        process(line.strip())\n\n"
            "# 写入文件\n"
            "with open('output.txt', 'w', encoding='utf-8') as f:\n"
            "    f.write('Hello World\\n')\n"
            "```\n"
            "- `with` 语句自动关闭文件，即使发生异常。\n"
            "- 模式：`'r'`读、`'w'`写（覆盖）、`'a'`追加、`'rb'`/`'wb'`二进制。\n"
            "- 始终指定 `encoding='utf-8'`，否则 Windows 默认 GBK 会导致乱码。\n\n"
            "## JSON 文件\n"
            "```python\n"
            "import json\n\n"
            "# 写入\n"
            "data = {'name': 'Alice', 'scores': [95, 87, 92]}\n"
            "with open('data.json', 'w', encoding='utf-8') as f:\n"
            "    json.dump(data, f, ensure_ascii=False, indent=2)\n\n"
            "# 读取\n"
            "with open('data.json', 'r', encoding='utf-8') as f:\n"
            "    data = json.load(f)\n"
            "```\n\n"
            "## CSV 文件\n"
            "```python\n"
            "import csv\n\n"
            "with open('grades.csv', 'w', newline='', encoding='utf-8') as f:\n"
            "    writer = csv.writer(f)\n"
            "    writer.writerow(['姓名', '分数'])\n"
            "    writer.writerow(['Alice', 95])\n\n"
            "with open('grades.csv', 'r', encoding='utf-8') as f:\n"
            "    reader = csv.DictReader(f)\n"
            "    for row in reader:\n"
            "        print(row['姓名'], row['分数'])\n"
            "```\n\n"
            "## 路径操作（pathlib）\n"
            "```python\n"
            "from pathlib import Path\n\n"
            "p = Path('data') / 'scores.csv'  # 跨平台拼接路径\n"
            "p.exists()       # 是否存在\n"
            "p.read_text()    # 一步读取\n"
            "p.write_text('hello')  # 一步写入\n"
            "p.stem           # 文件名（不含后缀）\n"
            "p.suffix         # 后缀 .csv\n"
            "p.parent         # 父目录\n"
            "```\n\n"
            "## 常见错误\n"
            "1. 忘记 `encoding` 参数导致 Windows 乱码。\n"
            "2. 文件未关闭就再次打开：不用 `with` 时需要手动 `f.close()`。\n"
            "3. `read()` 一次性读大文件导致内存溢出 — 用逐行读取。\n"
            "4. 相对路径不确定：用 `Path(__file__).parent` 定位脚本所在目录。\n\n"
            "## 练习建议\n"
            "写一个成绩管理程序：从 CSV 读取成绩，计算平均分和排名，结果输出为 JSON。用 pathlib 处理路径。"
        ),
        "tags": ["Python基础", "文件操作", "JSON", "CSV", "pathlib"],
    },
    {
        "title": "Python 常用内置模块",
        "content": (
            "## collections 模块\n"
            "```python\n"
            "from collections import Counter, defaultdict, deque\n\n"
            "# Counter：计数器\n"
            "words = ['apple', 'banana', 'apple', 'cherry', 'apple']\n"
            "cnt = Counter(words)\n"
            "print(cnt.most_common(2))  # [('apple', 3), ('banana', 1)]\n\n"
            "# defaultdict：带默认值的字典\n"
            "groups = defaultdict(list)\n"
            "for name, team in [('Alice', 'A'), ('Bob', 'B'), ('Carol', 'A')]:\n"
            "    groups[team].append(name)\n"
            "# {'A': ['Alice', 'Carol'], 'B': ['Bob']}\n\n"
            "# deque：双端队列，O(1) 头部插入\n"
            "dq = deque([1, 2, 3])\n"
            "dq.appendleft(0)  # deque([0, 1, 2, 3])\n"
            "```\n\n"
            "## datetime 模块\n"
            "```python\n"
            "from datetime import datetime, timedelta\n\n"
            "now = datetime.now()\n"
            "tomorrow = now + timedelta(days=1)\n"
            "formatted = now.strftime('%Y-%m-%d %H:%M:%S')\n"
            "parsed = datetime.strptime('2026-01-15', '%Y-%m-%d')\n"
            "```\n\n"
            "## itertools 模块\n"
            "```python\n"
            "from itertools import chain, combinations, permutations, product\n\n"
            "# chain：拼接多个可迭代对象\n"
            "list(chain([1,2], [3,4]))  # [1, 2, 3, 4]\n\n"
            "# combinations：组合（不重复）\n"
            "list(combinations('ABC', 2))  # [('A','B'), ('A','C'), ('B','C')]\n\n"
            "# permutations：排列\n"
            "list(permutations('AB', 2))  # [('A','B'), ('B','A')]\n\n"
            "# product：笛卡尔积\n"
            "list(product('AB', '12'))  # [('A','1'), ('A','2'), ('B','1'), ('B','2')]\n"
            "```\n\n"
            "## os / sys 模块\n"
            "```python\n"
            "import os\n"
            "os.listdir('.')               # 列出目录内容\n"
            "os.path.join('dir', 'f.txt')  # 拼接路径\n"
            "os.makedirs('a/b/c', exist_ok=True)  # 递归创建目录\n\n"
            "import sys\n"
            "sys.argv       # 命令行参数列表\n"
            "sys.path       # 模块搜索路径\n"
            "sys.exit(1)    # 退出程序\n"
            "```\n\n"
            "## 常见错误\n"
            "1. `os.path` vs `pathlib`：新代码推荐 pathlib，更直观。\n"
            "2. `datetime.now()` 没有时区信息 — 需要 `datetime.now(timezone.utc)` 或用 `zoneinfo` 模块。\n"
            "3. `Counter` 减法后可能出现零或负数计数，用 `+cnt` 过滤掉。\n\n"
            "## 练习建议\n"
            "用 Counter 统计一篇文章的词频 Top 10；用 itertools.product 生成所有可能的密码组合；用 defaultdict 实现图的邻接表表示。"
        ),
        "tags": ["Python基础", "模块", "collections", "datetime", "itertools", "os"],
    },
    {
        "title": "动态规划入门：从递推到记忆化",
        "content": (
            "## 什么是动态规划\n"
            "动态规划（Dynamic Programming, DP）是一种通过把原问题分解为相对简单的子问题来求解复杂问题的方法。"
            "适用条件：\n"
            "1. **重叠子问题**：子问题会被重复计算。\n"
            "2. **最优子结构**：原问题的最优解包含子问题的最优解。\n\n"
            "## 从递归到记忆化：斐波那契数列\n"
            "```python\n"
            "# 朴素递归 — 时间复杂度 O(2^n)\n"
            "def fib(n):\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    return fib(n-1) + fib(n-2)\n\n"
            "# 记忆化搜索 — 时间复杂度 O(n)\n"
            "from functools import lru_cache\n"
            "@lru_cache(maxsize=None)\n"
            "def fib_memo(n):\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    return fib_memo(n-1) + fib_memo(n-2)\n\n"
            "# 递推（自底向上）— 空间可优化到 O(1)\n"
            "def fib_dp(n):\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    a, b = 0, 1\n"
            "    for _ in range(2, n+1):\n"
            "        a, b = b, a + b\n"
            "    return b\n"
            "```\n\n"
            "## 经典题目：爬楼梯\n"
            "每次可以爬 1 或 2 个台阶，爬到第 n 阶有多少种方法？\n\n"
            "**状态定义**：`dp[i]` = 爬到第 i 阶的方法数。\n"
            "**状态转移**：`dp[i] = dp[i-1] + dp[i-2]`（从 i-1 阶爬一步，或从 i-2 阶爬两步）。\n"
            "**初始化**：`dp[1] = 1, dp[2] = 2`。\n\n"
            "```python\n"
            "def climb_stairs(n):\n"
            "    if n <= 2:\n"
            "        return n\n"
            "    a, b = 1, 2\n"
            "    for _ in range(3, n+1):\n"
            "        a, b = b, a + b\n"
            "    return b\n"
            "```\n\n"
            "## 经典题目：0-1 背包\n"
            "有 n 个物品，重量 w[i]，价值 v[i]，背包容量 W，求最大价值。\n\n"
            "**状态定义**：`dp[i][j]` = 前 i 个物品、容量为 j 时的最大价值。\n"
            "**状态转移**：\n"
            "- 不选第 i 个：`dp[i][j] = dp[i-1][j]`\n"
            "- 选第 i 个：`dp[i][j] = dp[i-1][j-w[i]] + v[i]`（前提 j >= w[i]）\n"
            "- 取较大值。\n\n"
            "```python\n"
            "def knapsack(W, weights, values):\n"
            "    n = len(weights)\n"
            "    dp = [0] * (W + 1)\n"
            "    for i in range(n):\n"
            "        for j in range(W, weights[i]-1, -1):  # 倒序遍历！\n"
            "            dp[j] = max(dp[j], dp[j - weights[i]] + values[i])\n"
            "    return dp[W]\n"
            "```\n"
            "注意内层循环必须倒序，否则同一物品会被重复选取。\n\n"
            "## 解题步骤总结\n"
            "1. 定义状态（dp 数组含义）\n"
            "2. 推导状态转移方程\n"
            "3. 确定初始条件和边界\n"
            "4. 确定遍历顺序（从前往后还是从后往前）\n"
            "5. 举例验证\n\n"
            "## 练习建议\n"
            "LeetCode 70（爬楼梯）、322（零钱兑换）、300（最长递增子序列）、72（编辑距离）。"
        ),
        "tags": ["算法", "动态规划", "递推", "记忆化", "背包问题"],
    },
    {
        "title": "数据结构基础：数组、链表、栈与队列",
        "content": (
            "## 数组（Python 列表）\n"
            "Python 的 list 底层是动态数组，自动扩容。\n\n"
            "| 操作 | 时间复杂度 |\n"
            "|------|------------|\n"
            "| 索引访问 `lst[i]` | O(1) |\n"
            "| 尾部追加 `lst.append(x)` | O(1) 均摊 |\n"
            "| 中间插入 `lst.insert(i, x)` | O(n) |\n"
            "| 查找 `lst.index(x)` | O(n) |\n"
            "| 排序 `lst.sort()` | O(n log n) |\n\n"
            "## 链表\n"
            "链表适合频繁插入/删除的场景。\n"
            "```python\n"
            "class ListNode:\n"
            "    def __init__(self, val=0, next=None):\n"
            "        self.val = val\n"
            "        self.next = next\n\n"
            "# 创建链表: 1 -> 2 -> 3\n"
            "head = ListNode(1, ListNode(2, ListNode(3)))\n\n"
            "# 反转链表\n"
            "def reverse_list(head):\n"
            "    prev = None\n"
            "    while head:\n"
            "        head.next, prev, head = prev, head, head.next\n"
            "    return prev\n"
            "```\n\n"
            "## 栈（后进先出 LIFO）\n"
            "```python\n"
            "# 用列表模拟栈\n"
            "stack = []\n"
            "stack.append('a')   # push\n"
            "stack.append('b')\n"
            "top = stack.pop()   # 'b'\n"
            "peek = stack[-1]    # 'a'\n\n"
            "# 经典应用：括号匹配\n"
            "def is_valid(s):\n"
            "    pairs = {')': '(', ']': '[', '}': '{'}\n"
            "    stack = []\n"
            "    for c in s:\n"
            "        if c in '([{':\n"
            "            stack.append(c)\n"
            "        elif not stack or stack.pop() != pairs[c]:\n"
            "            return False\n"
            "    return not stack\n"
            "```\n\n"
            "## 队列（先进先出 FIFO）\n"
            "```python\n"
            "from collections import deque\n\n"
            "q = deque()\n"
            "q.append('a')      # 入队\n"
            "q.append('b')\n"
            "first = q.popleft()  # 'a' 出队\n\n"
            "# 双端队列可以两端都进出\n"
            "q.appendleft('z')\n"
            "q.pop()            # 从右端出队\n"
            "```\n\n"
            "## 各结构适用场景\n"
            "| 结构 | 适用场景 |\n"
            "|------|----------|\n"
            "| 数组 | 随机访问多、插入删除少 |\n"
            "| 链表 | 频繁在头部/中间插入删除 |\n"
            "| 栈 | 递归模拟、撤销操作、表达式求值、DFS |\n"
            "| 队列 | BFS、任务调度、消息缓冲 |\n\n"
            "## 常见错误\n"
            "1. 用 `list` 做 `popleft()` 是 O(n) — 应该用 `deque`。\n"
            "2. 链表操作忘记处理空链表（head 为 None）的情况。\n"
            "3. 反转链表时丢失引用：注意交换顺序，建议用元组赋值。\n\n"
            "## 练习建议\n"
            "LeetCode 206（反转链表）、20（有效括号）、232（用栈实现队列）、225（用队列实现栈）、239（滑动窗口最大值）。"
        ),
        "tags": ["数据结构", "数组", "链表", "栈", "队列"],
    },
]


@dataclass
class KnowledgeChunk:
    document_id: str
    title: str
    content: str
    tags: list[str]
    score: float = 0.0
    retrieval_mode: str = "lexical"

    def to_context(self) -> str:
        tag_text = f" 标签：{', '.join(self.tags)}" if self.tags else ""
        return f"### {self.title}{tag_text}\n{self.content}"


class RAGPipeline:
    """Knowledge retrieval with pgvector similarity search and lexical fallback."""

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._ensure_seeded_sync()

    async def ingest(self, documents: list[str]) -> None:
        for index, content in enumerate(documents, start=1):
            await self.add_document(
                title=f"导入文档 {index}",
                content=content,
                tags=["imported"],
                source="api",
            )

    async def query(self, question: str, k: int = 5) -> list[str]:
        return [chunk.to_context() for chunk in await self.search(question, k=k)]

    async def list_documents(self) -> list[dict[str, Any]]:
        vector_docs = await self._list_vector_documents()
        if vector_docs:
            return vector_docs
        return [
            {
                "id": doc["id"],
                "title": doc["title"],
                "tags": doc.get("tags", []),
                "source": doc.get("source", "manual"),
                "created_at": doc["created_at"],
                "chunk_count": len(self._chunk_content(doc.get("content", ""))),
            }
            for doc in self._read_docs()
        ]

    async def add_document(
        self,
        title: str,
        content: str,
        tags: list[str] | None = None,
        source: str = "manual",
    ) -> dict[str, Any]:
        docs = self._read_docs()
        doc = {
            "id": str(uuid.uuid4()),
            "title": title.strip() or "未命名知识文档",
            "content": content.strip(),
            "tags": tags or [],
            "source": source,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        docs.append(doc)
        self._write_docs(docs)
        await self._upsert_vector_document(doc)
        return doc

    async def search(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        vector_chunks = await self._search_vector(query, k=k)
        if vector_chunks:
            return vector_chunks
        return self._search_lexical(query, k=k)

    def _search_lexical(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        chunks: list[KnowledgeChunk] = []
        for doc in self._read_docs():
            tags = doc.get("tags", [])
            title = doc.get("title", "")
            for chunk in self._chunk_content(doc.get("content", "")):
                chunk_terms = self._tokenize(" ".join([title, chunk, *tags]))
                score = self._score(query_terms, chunk_terms)
                if score > 0:
                    chunks.append(
                        KnowledgeChunk(
                            document_id=doc["id"],
                            title=title,
                            content=chunk,
                            tags=tags,
                            score=score,
                            retrieval_mode="lexical",
                        )
                    )

        chunks.sort(key=lambda item: item.score, reverse=True)
        return chunks[:k]

    # ---- 语义空间真投影 (768d → 2D PCA) ----
    # 缓存 PCA 参数, 保证 query 与文档用同一组主成分投影 (投影一致性)
    _semantic_cache: dict[str, Any] | None = None

    async def compute_semantic_map(self) -> dict[str, Any]:
        """768d embedding 真投影 2D 语义平面.

        - doc vector = chunk embedding 均值, l2 归一化
        - PCA: 中心化 → numpy SVD → 取前 2 主成分
        - 文档坐标 = 真实语义位置 (讲同一主题的文档自然聚簇)
        - 缓存 (mean, components, scale, doc_vectors) 供 project_query 用同一投影
        """
        import numpy as np

        ids_titles, vectors = await self._collect_doc_vectors()
        if len(vectors) < 3:
            return {"nodes": [], "explained_variance": 0.0, "embedding_dim": 0, "retrieval": "insufficient"}

        X = np.array(vectors, dtype=np.float64)  # (n, d) 已归一化
        mean = X.mean(axis=0)
        Xc = X - mean
        # SVD PCA
        _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
        components = Vt[:2]  # (2, d)
        coords = Xc @ components.T  # (n, 2)
        total_var = float((S ** 2).sum()) or 1.0
        explained = float((S[:2] ** 2).sum() / total_var)

        # 归一化到 [0.08, 0.92] (留边距)
        lo = coords.min(axis=0)
        hi = coords.max(axis=0)
        span = np.where((hi - lo) < 1e-9, 1.0, hi - lo)
        norm = (coords - lo) / span * 0.84 + 0.08

        # 真 cosine 相似度边 (top 阈值, 给前端画淡连线)
        sims = X @ X.T
        edges: list[dict[str, Any]] = []
        n = len(ids_titles)
        for i in range(n):
            for j in range(i + 1, n):
                s = float(sims[i, j])
                if s >= 0.62:
                    edges.append({
                        "source": ids_titles[i]["id"],
                        "target": ids_titles[j]["id"],
                        "similarity": round(s, 4),
                    })

        RAGPipeline._semantic_cache = {
            "mean": mean,
            "components": components,
            "lo": lo,
            "span": span,
            "doc_ids": [d["id"] for d in ids_titles],
            "doc_titles": [d["title"] for d in ids_titles],
            "doc_vectors": X,
        }

        nodes = [
            {
                **meta,
                "x": round(float(norm[i, 0]), 4),
                "y": round(float(norm[i, 1]), 4),
            }
            for i, meta in enumerate(ids_titles)
        ]
        return {
            "nodes": nodes,
            "edges": edges,
            "explained_variance": round(explained, 4),
            "embedding_dim": int(X.shape[1]),
            "retrieval": "pgvector-pca",
        }

    async def project_query_semantic(self, query: str, k: int = 5) -> dict[str, Any]:
        """把 query embed 后用同一组 PCA 主成分投影到语义平面.

        返回 query 落点 + 真 cosine top-k. 落点必然靠近语义相关文档 — 可当场验证.
        """
        import numpy as np

        if RAGPipeline._semantic_cache is None:
            await self.compute_semantic_map()
        cache = RAGPipeline._semantic_cache
        if not cache:
            return {"x": 0.5, "y": 0.5, "topk": [], "note": "semantic map unavailable"}

        emb = await self._embed_query(query)
        if not emb:
            return {"x": 0.5, "y": 0.5, "topk": [], "note": "embed failed"}
        v = np.array(emb, dtype=np.float64)
        nrm = np.linalg.norm(v) or 1.0
        v = v / nrm

        p = (v - cache["mean"]) @ cache["components"].T  # (2,)
        norm_p = (p - cache["lo"]) / cache["span"] * 0.84 + 0.08
        # clamp — query 可能落在文档分布范围外
        x = float(np.clip(norm_p[0], 0.03, 0.97))
        y = float(np.clip(norm_p[1], 0.03, 0.97))

        sims = cache["doc_vectors"] @ v  # 真 cosine (全部已归一化)
        order = np.argsort(-sims)[: max(1, min(k, 10))]
        topk = [
            {
                "document_id": cache["doc_ids"][int(i)],
                "title": cache["doc_titles"][int(i)],
                "similarity": round(float(sims[int(i)]), 4),
            }
            for i in order
        ]
        return {"x": round(x, 4), "y": round(y, 4), "topk": topk}

    async def _collect_doc_vectors(self) -> tuple[list[dict[str, Any]], list[list[float]]]:
        """拉所有 doc 的 chunk-mean embedding (l2 归一化). 复用 topology 取数逻辑."""
        import math

        async with get_db() as db:
            stmt = (
                select(DocumentModel)
                .options(selectinload(DocumentModel.chunks))
                .order_by(DocumentModel.created_at.desc())
            )
            documents = (await db.execute(stmt)).scalars().all()

        metas: list[dict[str, Any]] = []
        vectors: list[list[float]] = []
        for doc in documents:
            chunk_vecs: list[list[float]] = []
            for ch in doc.chunks:
                emb = ch.embedding
                if emb is None:
                    continue
                try:
                    vec = [float(x) for x in emb]  # type: ignore[union-attr]
                except (TypeError, ValueError):
                    continue
                if vec:
                    chunk_vecs.append(vec)
            if not chunk_vecs:
                continue
            dim = len(chunk_vecs[0])
            mean = [0.0] * dim
            for v in chunk_vecs:
                for i in range(dim):
                    mean[i] += v[i]
            for i in range(dim):
                mean[i] /= len(chunk_vecs)
            norm = math.sqrt(sum(x * x for x in mean)) or 1.0
            vectors.append([x / norm for x in mean])
            metas.append({
                "id": doc.id,
                "title": doc.title,
                "tags": doc.tags or [],
                "chunk_count": len(doc.chunks),
            })
        return metas, vectors

    async def compute_topology(self) -> dict[str, Any]:
        """计算知识库拓扑: 文档节点 + 真 embedding 相似度边.

        策略:
        1. 拉所有 doc + 关联 chunks (含 embedding).
        2. 每个 doc 的 embedding = chunks embedding 平均 (l2-normalize).
        3. 算 doc 间 cosine 相似度矩阵.
        4. 保留 sim >= threshold 的边 (默认 0.55), 上限每节点 4 条最强边.
        无 DB / pgvector 时回退: 用文档标题 + tags lexical 共词数当近似相似度。
        """
        # 优先 pgvector
        try:
            return await self._compute_topology_vector()
        except Exception as exc:
            logger.info("Topology vector path unavailable, fallback to lexical: %s", exc)
            return self._compute_topology_lexical()

    async def _compute_topology_vector(self) -> dict[str, Any]:
        import math

        async with get_db() as db:
            stmt = (
                select(DocumentModel)
                .options(selectinload(DocumentModel.chunks))
                .order_by(DocumentModel.created_at.desc())
            )
            documents = (await db.execute(stmt)).scalars().all()

        nodes: list[dict[str, Any]] = []
        doc_vectors: list[tuple[str, list[float]]] = []
        for doc in documents:
            chunk_vecs: list[list[float]] = []
            for ch in doc.chunks:
                emb = ch.embedding
                if emb is None:
                    continue
                # pgvector 返回 numpy array / list, 用 float() 转换并捕获异常
                try:
                    vec = [float(x) for x in emb]  # type: ignore[union-attr]
                except (TypeError, ValueError):
                    continue
                if vec:
                    chunk_vecs.append(vec)
            if not chunk_vecs:
                continue
            dim = len(chunk_vecs[0])
            mean = [0.0] * dim
            for v in chunk_vecs:
                for i in range(dim):
                    mean[i] += v[i]
            for i in range(dim):
                mean[i] /= len(chunk_vecs)
            # l2 normalize
            norm = math.sqrt(sum(x * x for x in mean)) or 1.0
            mean = [x / norm for x in mean]
            doc_vectors.append((doc.id, mean))
            nodes.append({
                "id": doc.id,
                "title": doc.title,
                "tags": doc.tags or [],
                "chunk_count": len(doc.chunks),
                "source": doc.source,
            })

        edges: list[dict[str, Any]] = []
        per_node_keep = 4
        threshold = 0.55
        candidates: list[tuple[str, str, float]] = []
        for i in range(len(doc_vectors)):
            for j in range(i + 1, len(doc_vectors)):
                a_id, a = doc_vectors[i]
                b_id, b = doc_vectors[j]
                sim = sum(x * y for x, y in zip(a, b))
                if sim >= threshold:
                    candidates.append((a_id, b_id, sim))
        # 排序后按节点限流
        candidates.sort(key=lambda t: t[2], reverse=True)
        per_count: dict[str, int] = {}
        for a, b, sim in candidates:
            if per_count.get(a, 0) >= per_node_keep or per_count.get(b, 0) >= per_node_keep:
                continue
            edges.append({"source": a, "target": b, "similarity": round(sim, 4)})
            per_count[a] = per_count.get(a, 0) + 1
            per_count[b] = per_count.get(b, 0) + 1

        return {
            "nodes": nodes,
            "edges": edges,
            "embedding_dim": len(doc_vectors[0][1]) if doc_vectors else 0,
            "threshold": threshold,
            "retrieval": "pgvector",
        }

    def _compute_topology_lexical(self) -> dict[str, Any]:
        """无 embedding 时回退: 用 tag/title 共词比当近似相似度."""
        docs = self._read_docs()
        nodes: list[dict[str, Any]] = []
        token_sets: list[tuple[str, set[str]]] = []
        for doc in docs:
            tokens = set(self._tokenize(doc.get("title", "")))
            for t in doc.get("tags", []) or []:
                tokens.update(self._tokenize(str(t)))
            if not tokens:
                continue
            token_sets.append((doc["id"], tokens))
            nodes.append({
                "id": doc["id"],
                "title": doc["title"],
                "tags": doc.get("tags", []),
                "chunk_count": len(self._chunk_content(doc.get("content", ""))),
                "source": doc.get("source", "manual"),
            })

        edges: list[dict[str, Any]] = []
        for i in range(len(token_sets)):
            for j in range(i + 1, len(token_sets)):
                a_id, a = token_sets[i]
                b_id, b = token_sets[j]
                inter = len(a & b)
                union = len(a | b) or 1
                sim = inter / union  # Jaccard
                if sim >= 0.18:
                    edges.append({"source": a_id, "target": b_id, "similarity": round(sim, 4)})

        return {
            "nodes": nodes,
            "edges": edges,
            "embedding_dim": 0,
            "threshold": 0.18,
            "retrieval": "lexical",
        }

    async def _list_vector_documents(self) -> list[dict[str, Any]]:
        try:
            async with get_db() as db:
                stmt = (
                    select(DocumentModel)
                    .options(selectinload(DocumentModel.chunks))
                    .order_by(DocumentModel.created_at.desc())
                )
                result = await db.execute(stmt)
                documents = result.scalars().all()
                return [
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "tags": doc.tags or [],
                        "source": doc.source,
                        "created_at": doc.created_at.isoformat(),
                        "chunk_count": len(doc.chunks),
                        "retrieval": "pgvector",
                    }
                    for doc in documents
                ]
        except Exception as exc:
            logger.info("Vector document listing unavailable, using JSON store: %s", exc)
            return []

    async def _search_vector(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        try:
            await self._ensure_vector_index()
            query_embedding = await self._embed_query(query)
            if not query_embedding:
                return []

            distance = DocumentChunkModel.embedding.cosine_distance(query_embedding)
            stmt = (
                select(
                    DocumentChunkModel,
                    DocumentModel,
                    distance.label("distance"),
                )
                .join(DocumentModel, DocumentModel.id == DocumentChunkModel.document_id)
                .order_by(distance)
                .limit(max(1, min(k, 20)))
            )
            async with get_db() as db:
                rows = (await db.execute(stmt)).all()
            chunks: list[KnowledgeChunk] = []
            for chunk, doc, raw_distance in rows:
                distance_value = float(raw_distance or 0.0)
                chunks.append(
                    KnowledgeChunk(
                        document_id=doc.id,
                        title=doc.title,
                        content=chunk.content,
                        tags=doc.tags or [],
                        score=max(0.0, 1.0 - distance_value),
                        retrieval_mode="pgvector",
                    )
                )
            return chunks
        except Exception as exc:
            logger.info("Vector search unavailable, falling back to lexical retrieval: %s", exc)
            return []

    async def _ensure_vector_index(self) -> None:
        docs = self._read_docs()
        if not docs:
            return
        try:
            async with get_db() as db:
                existing_count = await db.scalar(select(func.count(DocumentModel.id)))
        except Exception as exc:
            logger.info("Vector index check unavailable: %s", exc)
            return

        if existing_count:
            return

        for doc in docs:
            await self._upsert_vector_document(doc)

    async def _upsert_vector_document(self, doc: dict[str, Any]) -> None:
        content = str(doc.get("content", "")).strip()
        if not content:
            return
        try:
            chunks = self._chunk_content(content)
            embeddings = await self._embed_documents(chunks)
            if len(embeddings) != len(chunks):
                return

            async with get_db() as db:
                existing = await db.get(DocumentModel, doc["id"])
                if existing:
                    return

                document = DocumentModel(
                    id=doc["id"],
                    title=doc.get("title", "未命名知识文档"),
                    content=content,
                    tags=doc.get("tags", []),
                    source=doc.get("source", "manual"),
                    created_at=_parse_datetime(doc.get("created_at")),
                )
                db.add(document)
                await db.flush()
                for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    db.add(
                        DocumentChunkModel(
                            document_id=document.id,
                            chunk_index=index,
                            content=chunk,
                            embedding=embedding,
                        )
                    )
                await db.commit()
        except Exception as exc:
            logger.info("Vector document indexing skipped for %s: %s", doc.get("title"), exc)

    @staticmethod
    async def _embed_documents(chunks: list[str]) -> list[list[float]]:
        if not chunks:
            return []
        embeddings = get_embeddings()
        return await asyncio.to_thread(embeddings.embed_documents, chunks)

    @staticmethod
    async def _embed_query(query: str) -> list[float]:
        embeddings = get_embeddings()
        return await asyncio.to_thread(embeddings.embed_query, query)

    async def build_context(self, query: str, k: int = 5, max_chars: int = 3000) -> str:
        parts: list[str] = []
        total = 0
        for chunk in await self.search(query, k=k):
            text = chunk.to_context()
            if total + len(text) > max_chars:
                break
            parts.append(text)
            total += len(text)
        return "\n\n".join(parts)

    async def build_cited_context(self, query: str, k: int = 5, max_chars: int = 3000):
        """带引用编号的上下文 + sources 元数据 + 低置信度标记。

        返回 services.guardrail.citation.CitedKnowledgeContext。
        延迟导入避免循环依赖。
        """
        from services.guardrail.citation import build_cited_context

        chunks = await self.search(query, k=k)
        return build_cited_context(chunks, max_chars=max_chars)

    def _ensure_seeded_sync(self) -> None:
        if DOCUMENTS_FILE.exists() and self._read_docs():
            return
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()),
                "title": doc["title"],
                "content": doc["content"],
                "tags": doc["tags"],
                "source": "seed",
                "created_at": now,
            }
            for doc in SEED_DOCUMENTS
        ]
        self._write_docs(docs)

    @staticmethod
    def _read_docs() -> list[dict[str, Any]]:
        if not DOCUMENTS_FILE.exists():
            return []
        try:
            data = json.loads(DOCUMENTS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _write_docs(docs: list[dict[str, Any]]) -> None:
        DOCUMENTS_FILE.write_text(
            json.dumps(docs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _chunk_content(content: str, chunk_size: int = 420) -> list[str]:
        cleaned = re.sub(r"\s+", " ", content).strip()
        if not cleaned:
            return []
        return [cleaned[start : start + chunk_size] for start in range(0, len(cleaned), chunk_size)]

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        lowered = text.lower()
        words = set(re.findall(r"[a-z0-9_+#.-]{2,}", lowered))
        for segment in re.findall(r"[\u4e00-\u9fff]+", lowered):
            if len(segment) <= 2:
                words.add(segment)
            else:
                words.update(segment[i : i + 2] for i in range(len(segment) - 1))
                words.update(segment[i : i + 3] for i in range(len(segment) - 2))
        return {word for word in words if word.strip()}

    @staticmethod
    def _score(query_terms: set[str], chunk_terms: set[str]) -> float:
        overlap = query_terms & chunk_terms
        if not overlap:
            return 0.0
        precision = len(overlap) / math.sqrt(max(len(chunk_terms), 1))
        recall = len(overlap) / max(len(query_terms), 1)
        return recall * 0.75 + precision * 0.25


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)
