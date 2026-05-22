
export interface Command {
  execute: () => void;
  undo: () => void;
}

export class CommandManager {
  private history: Command[] = [];
  private redoStack: Command[] = [];

  execute(command: Command) {
    command.execute();
    this.history.push(command);
    this.redoStack = []; // Clear redo on new command
  }

  undo() {
    const command = this.history.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
    }
  }

  redo() {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.history.push(command);
    }
  }

  clear() {
    this.history = [];
    this.redoStack = [];
  }
}

export const commandManager = new CommandManager();
