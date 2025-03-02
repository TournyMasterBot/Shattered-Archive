import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Drown implements IAbility {
  private static instance: Drown;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Drown'
'DROWN'
Syntax: cast 'drown' <target>

The Wu Jen forces water into the lungs of their enemies, affecting
everyone not currently grouped with them. For a short time after, anyone
affected may panic at the sensation of drowning, failing any spells they are
casting or finding themselves unable to flee from combat.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Drown.instance === undefined) {
      Drown.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Drown {
    if (!Drown.instance) {
      Drown.instance = new Drown();
    }
    return Drown.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Drown.GetInstance() as T;
  }
}

export default Drown;
