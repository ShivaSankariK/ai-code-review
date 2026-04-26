const { WebSocketServer } = require("ws");
const { SDK } = require("./sdk");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Maximum character length for a todo item. Enforced server-side so the
// limit applies regardless of which client is connected.
const MAX_TODO_LENGTH = 200;

// ---------------------------------------------------------
// Shared style constants
// Centralising repeated style objects eliminates copy-paste drift and makes
// visual changes a one-line edit instead of a grep-and-replace across handlers.
// ---------------------------------------------------------
const STYLES = {
  app: { padding: "32px", fontFamily: "sans-serif", maxWidth: "420px", margin: "40px auto" },
  title: { fontSize: "24px", fontWeight: "bold", marginBottom: "16px", display: "block" },
  inputRow: { display: "flex", gap: "8px", marginBottom: "16px" },
  mainInput: { flex: "1", padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "4px" },
  addButton: { padding: "8px 16px", cursor: "pointer", borderRadius: "4px", border: "none", background: "#4f46e5", color: "#fff" },
  todoList: { display: "flex", flexDirection: "column", gap: "8px" },
  todoRow: { display: "flex", alignItems: "center", gap: "8px", padding: "10px", border: "1px solid #e5e7eb", borderRadius: "4px" },
  todoLabel: { flex: "1" },
  editInput: { flex: "1", padding: "6px", fontSize: "14px", border: "1px solid #4f46e5", borderRadius: "4px" },
  outlineBtn: { padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "1px solid #ccc", background: "#fff" },
  primaryBtn: { padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "none", background: "#4f46e5", color: "#fff" },
};

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("Client connected");

  const sdk = new SDK(ws);
  const todos = []; // { text, container, label, editBtn, deleteBtn, editInput, saveBtn }
  let currentInputValue = "";
  
  // Guard flag: prevents re-entrant handleAdd calls while one is in progress.
  let addInProgress = false;

  // --- Layout ---
  const title = sdk.text().text("Todo List").style(STYLES.title);

  const input = sdk
    .input()
    .placeholder("What needs to be done?")
    .style(STYLES.mainInput)
    .on("change", (value) => {
      // value arrives from the client as unknown; coerce to string defensively.
      currentInputValue = typeof value === "string" ? value : "";
    });

  const addButton = sdk
    .button()
    .text("Add")
    .style(STYLES.addButton)
    .on("click", handleAdd);

  const inputRow = sdk.container().style(STYLES.inputRow);
  const todoList = sdk.container().style(STYLES.todoList);
  const app = sdk.container().style(STYLES.app);

  inputRow.children(input, addButton);
  app.children(title, inputRow, todoList);

  // --- Handlers ---
  function handleAdd() {
    // Prevent double-submission if the client fires the click event twice
    // before the server has finished processing (e.g. rapid clicks).
    if (addInProgress) return;
    addInProgress = true;

    try {
      const text = currentInputValue.trim();
      if (!text) return;

      // Enforce maximum todo length to prevent excessively long entries being
      // stored or rendered.
      if (text.length > MAX_TODO_LENGTH) {
        console.warn(`Rejected todo: exceeds ${MAX_TODO_LENGTH} characters`);
        return;
      }

      currentInputValue = "";
      input.update().value("").flush();

      const todo = { text };
      const label = sdk.text().text(text).style(STYLES.todoLabel);
      
      const editBtn = sdk
        .button()
        .text("Edit")
        .style(STYLES.outlineBtn)
        .on("click", () => handleEdit(todo));

      const deleteBtn = sdk
        .button()
        .text("Delete")
        .style(STYLES.outlineBtn)
        .on("click", () => handleDelete(todo));

      const container = sdk.container().style(STYLES.todoRow);
      
      container.children(label, editBtn, deleteBtn);
      Object.assign(todo, { label, editBtn, deleteBtn, container });
      todos.push(todo);
      todoList.children(...todos.map((t) => t.container));
    } finally {
      addInProgress = false;
    }
  }

  function handleEdit(todo) {
    // Ignore if the todo is already in edit mode.
    if (todo.editInput) return;

    const editState = { value: todo.text };

    const editInput = sdk
      .input()
      .value(todo.text)
      .style(STYLES.editInput)
      .on("change", (v) => { editState.value = typeof v === "string" ? v : editState.value; });

    const saveBtn = sdk
      .button()
      .text("Save")
      .style(STYLES.primaryBtn)
      .on("click", () => handleSave(todo, editInput, saveBtn, editState));

    // Destroy the outgoing nodes so they don't become orphaned roots on the client.
    todo.label.destroy();
    todo.editBtn.destroy();

    todo.container.children(editInput, saveBtn, todo.deleteBtn);
    todo.editInput = editInput;
    todo.saveBtn = saveBtn;
  }

  function handleSave(todo, editInput, saveBtn, editState) {
    const newText = editState.value.trim() || todo.text;
    todo.text = newText;

    // Recreate label and editBtn since they were destroyed on entering edit mode.
    const label = sdk.text().text(newText).style(STYLES.todoLabel);
    const editBtn = sdk
      .button()
      .text("Edit")
      .style(STYLES.outlineBtn)
      .on("click", () => handleEdit(todo));

    editInput.destroy();
    saveBtn.destroy();
    delete todo.editInput;
    delete todo.saveBtn;

    todo.label = label;
    todo.editBtn = editBtn;
    todo.container.children(label, editBtn, todo.deleteBtn);
  }

  function handleDelete(todo) {
    const idx = todos.indexOf(todo);
    if (idx !== -1) todos.splice(idx, 1);
    
    todoList.children(...todos.map((t) => t.container));
    
    todo.editInput?.destroy();
    todo.saveBtn?.destroy();
    todo.label.destroy();
    todo.editBtn.destroy();
    todo.deleteBtn.destroy();
    todo.container.destroy();
  }

  ws.on("close", () => console.log("Client disconnected"));
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);