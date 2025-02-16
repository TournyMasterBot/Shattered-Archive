import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Invisibility implements IAbility {
  private static instance: Invisibility;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Invisibility";
    this.helpFile = `
help invis
INVIS 'MASS INVIS' INVISIBILITY
INVIS 'MASS INVIS' INVISIBILITY

Syntax: cast 'invisibility' <character>
        cast 'invisibility' <object>
        cast 'mass invis'

The invisibility spell makes the target character invisible. Invisible
characters will become visible when they attack. It may also be cast on an
object to render the object invisible.

The mass invisibility spell makes all characters in the caster's group
invisible, including the caster.

See also - ILLUSION
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Invisibility.instance === undefined) {
      Invisibility.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Invisibility {
    if (!Invisibility.instance) {
      Invisibility.instance = new Invisibility();
    }
    return Invisibility.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Invisibility.GetInstance() as T;
  }
}

export default Invisibility;
