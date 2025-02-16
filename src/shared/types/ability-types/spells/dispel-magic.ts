import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelMagic implements IAbility {
  private static instance: DispelMagic;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Dispel Magic";
    this.helpFile = `
help 'Dispel Magic'
'DISPEL MAGIC' CANCELLATION
'DISPEL MAGIC' CANCELLATION

Syntax: cast 'dispel magic' <character>
        cast 'cancellation' <character>

Both of these spells remove magical effects from the target. Dispel magic
has a reduced chance of working and is considered an attack spell.
Cancellation can only be used on allies, but is much more effective and does
not provoke attack. Unfortunately, the spells do not discriminate between
harmful and benign spells.

The chance of dispelling is based on the level of the spell. Permanent spells
(such as mobile sanctuary) are much harder to remove. Not all spells may
be dispelled; notable examples are poison and plague.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DispelMagic.instance === undefined) {
      DispelMagic.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DispelMagic {
    if (!DispelMagic.instance) {
      DispelMagic.instance = new DispelMagic();
    }
    return DispelMagic.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DispelMagic.GetInstance() as T;
  }
}

export default DispelMagic;
