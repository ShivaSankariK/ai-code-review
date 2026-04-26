const { WebSocketServer } = require("ws");
const { SDK } = require("./sdk");

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", (ws) => {
  console.log("Client connected");

  const sdk = new SDK(ws);
  const todos = []; // { text, container, label, editBtn, deleteBtn, editInput?, saveBtn? }
  let currentInputValue = "";

  // --- Layout ---
  const title = sdk.text().text("Todo List").style({ fontSize: "24px", fontWeight: "bold", marginBottom: "16px", display: "block" });

  const input = sdk
    .input()
    .placeholder("What needs to be done?")
    .style({ flex: "1", padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "4px" })
    .on("change", (value) => { currentInputValue = value; });

  const addButton = sdk
    .button()
    .text("Add")
    .style({ padding: "8px 16px", cursor: "pointer", borderRadius: "4px", border: "none", background: "#4f46e5", color: "#fff", fontSize: "14px" })
    .on("click", handleAdd);

  const inputRow = sdk.container().style({ display: "flex", gap: "8px", marginBottom: "16px" });
  const todoList = sdk.container().style({ display: "flex", flexDirection: "column", gap: "8px" });
  const app = sdk
    .container()
    .style({ padding: "32px", fontFamily: "sans-serif", maxWidth: "420px", margin: "40px auto" });

  inputRow.children(input, addButton);
  app.children(title, inputRow, todoList);

  // --- Handlers ---
  function handleAdd() {
    const text = currentInputValue.trim();
    if (!text) return;

    currentInputValue = "";
    input.update().value("").flush();

    const todo = { text };
    const label = sdk.text().text(text).style({ flex: "1" });
    const editBtn = sdk
      .button()
      .text("Edit")
      .style({ padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", fontSize: "12px" })
      .on("click", () => handleEdit(todo));
    const deleteBtn = sdk
      .button()
      .text("Delete")
      .style({ padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", fontSize: "12px" })
      .on("click", () => handleDelete(todo));
    const container = sdk
      .container()
      .style({ display: "flex", alignItems: "center", gap: "8px", padding: "10px", border: "1px solid #e5e7eb", borderRadius: "4px", background: "#fafafa" });

    container.children(label, editBtn, deleteBtn);
    Object.assign(todo, { label, editBtn, deleteBtn, container });
    todos.push(todo);
    todoList.children(...todos.map((t) => t.container));
  }

  function handleEdit(todo) {
    const editState = { value: todo.text };

    const editInput = sdk
      .input()
      .value(todo.text)
      .style({ flex: "1", padding: "6px", fontSize: "14px", border: "1px solid #4f46e5", borderRadius: "4px" })
      .on("change", (v) => { editState.value = v; });

    const saveBtn = sdk
      .button()
      .text("Save")
      .style({ padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "none", background: "#4f46e5", color: "#fff", fontSize: "12px" })
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
    const label = sdk.text().text(newText).style({ flex: "1" });
    const editBtn = sdk
      .button()
      .text("Edit")
      .style({ padding: "4px 10px", cursor: "pointer", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", fontSize: "12px" })
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

console.log("WebSocket server running on ws://localhost:3001");
