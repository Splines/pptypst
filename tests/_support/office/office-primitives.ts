/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

// Small Office.js collection/value objects used by app code.
class MockCollection<T> implements Loadable {
  private readonly getItems: () => T[];

  constructor(getItems: () => T[]) {
    this.getItems = getItems;
  }

  get items(): T[] {
    return this.getItems();
  }

  load() {}
}

class MockItemCollection<T extends Identifiable> extends MockCollection<T> {
  private readonly missingItem?: (_id: string) => T;

  constructor(
    getItems: () => T[],
    missingItem?: (_id: string) => T,
  ) {
    super(getItems);
    this.missingItem = missingItem;
  }

  getItem(id: string): T {
    const item = this.items.find(candidate => candidate.id === id);
    if (item) return item;
    if (this.missingItem) return this.missingItem(id);

    throw new Error(`Item ${id} not found.`);
  }
}

class MockFill implements Loadable {
  foregroundColor: string | null;

  constructor(foregroundColor: string | null) {
    this.foregroundColor = foregroundColor;
  }

  load() {}
}

class MockTagItem implements Loadable {
  readonly key: string;
  readonly isNullObject: boolean;
  private readonly getValue: () => string;

  constructor(
    key: string,
    getValue: () => string,
    isNullObject = false,
  ) {
    this.key = key;
    this.getValue = getValue;
    this.isNullObject = isNullObject;
  }

  get value(): string {
    return this.getValue();
  }

  load() {}
}

class MockTagCollection implements Loadable {
  private readonly tagMap: Map<string, string>;
  private readonly onAdd: (_key: string, _value: string) => void;

  constructor(
    tagMap: Map<string, string>,
    onAdd: (_key: string, _value: string) => void,
  ) {
    this.tagMap = tagMap;
    this.onAdd = onAdd;
  }

  get items(): MockTagItem[] {
    return Array.from(
      this.tagMap.entries(),
      ([key, value]) => new MockTagItem(key, () => value),
    );
  }

  add(key: string, value: string) {
    this.tagMap.set(key, value);
    this.onAdd(key, value);
  }

  getItemOrNullObject(key: string): MockTagItem {
    if (!this.tagMap.has(key)) {
      return new MockTagItem(key, () => "", true);
    }

    return new MockTagItem(key, () => this.tagMap.get(key) ?? "");
  }

  load() {}
}

class MockXmlPart implements Loadable {
  readonly id: string;
  readonly xml: string;
  readonly namespaceUri: string | null;

  constructor(
    id: string,
    xml: string,
    namespaceUri: string | null,
  ) {
    this.id = id;
    this.xml = xml;
    this.namespaceUri = namespaceUri;
  }

  getXml() {
    return { value: this.xml };
  }

  load() {}
}

class MockCustomXmlPartCollection implements Loadable {
  private readonly getParts: () => MockXmlPart[];
  private readonly addPart: (_xml: string) => MockXmlPart;

  constructor(
    getParts: () => MockXmlPart[],
    addPart: (_xml: string) => MockXmlPart,
  ) {
    this.getParts = getParts;
    this.addPart = addPart;
  }

  get items(): MockXmlPart[] {
    return this.getParts();
  }

  add(xml: string): MockXmlPart {
    return this.addPart(xml);
  }

  getByNamespace(namespaceUri: string): MockCollection<MockXmlPart> {
    return new MockCollection(() => this.getParts().filter(part => part.namespaceUri === namespaceUri));
  }

  load() {}
}
