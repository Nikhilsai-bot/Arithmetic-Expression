// Custom Stack data structure — implemented from scratch (no built-in array
// methods used as a "cheat"; push/pop/peek are explicit for DSA clarity).
class Stack {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items[this.items.length] = item;
  }

  pop() {
    if (this.isEmpty()) return undefined;
    const top = this.items[this.items.length - 1];
    this.items.length = this.items.length - 1;
    return top;
  }

  peek() {
    if (this.isEmpty()) return undefined;
    return this.items[this.items.length - 1];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }

  toArray() {
    return [...this.items];
  }
}

module.exports = Stack;
