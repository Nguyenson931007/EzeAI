import { useStore } from './useStore';
import type { Annotation } from './useStore';
import { commandManager } from './CommandHistory';
import type { Command } from './CommandHistory';

export class AddAnnotationCommand implements Command {
  private annotation: Annotation;

  constructor(annotation: Annotation) {
    this.annotation = annotation;
  }

  execute() {
    const { annotations, setAnnotations } = useStore.getState();
    setAnnotations([...annotations, this.annotation]);
  }

  undo() {
    const { annotations, setAnnotations } = useStore.getState();
    setAnnotations(annotations.filter(a => a.id !== this.annotation.id));
  }
}

export class DeleteAnnotationsCommand implements Command {
  private ids: string[];
  private deleted: Annotation[] = [];

  constructor(ids: string[]) {
    this.ids = ids;
  }

  execute() {
    const { annotations, setAnnotations } = useStore.getState();
    this.deleted = annotations.filter(a => this.ids.includes(a.id));
    setAnnotations(annotations.filter(a => !this.ids.includes(a.id)));
  }

  undo() {
    const { annotations, setAnnotations } = useStore.getState();
    setAnnotations([...annotations, ...this.deleted]);
  }
}

export const executeAddAnnotation = (ann: Annotation) => {
  commandManager.execute(new AddAnnotationCommand(ann));
};

export const executeDeleteAnnotations = (ids: string[]) => {
  commandManager.execute(new DeleteAnnotationsCommand(ids));
};
