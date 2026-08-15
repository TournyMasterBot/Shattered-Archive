import { roleParchmentCommands, type ParchmentBagTarget } from '../../domain/roleParchment.js';
import type { RoleDef } from '../../domain/types.js';
import CommandsDialog from './CommandsDialog.js';

interface RoleParchmentModalProps {
  role: RoleDef;
  bag?: ParchmentBagTarget;
  onClose: () => void;
}

export default function RoleParchmentModal({ role, bag, onClose }: RoleParchmentModalProps) {
  const commands = roleParchmentCommands(role, bag);

  return (
    <CommandsDialog
      title={`${role.name} role parchment${bag ? ` — Bag ${bag.number}` : ''}`}
      dialogLabel={`Role parchment commands for ${role.name}`}
      textareaLabel="Role parchment commands"
      hint={`Hand these commands to a player assigned this role, one line at a time, to write an in-game parchment revealing it${
        bag ? `, then seal it into bag ${bag.number}` : ''
      }.`}
      commands={commands}
      onClose={onClose}
    />
  );
}
