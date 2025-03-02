import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Absorption implements IAbility {
  private static instance: Absorption;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
ABSORPTION

Syntax: cast 'absorption'

When the battlemage casts this spell, a magical shield is placed around
their body, reducing any and all kinds of damage intended for the caster.

Groups containing this spell: Battlemagic

SEE ALSO:  BATTLEMAGE, BATTLEMAGIC

Updated 03.19.2021
`;

    if (Absorption.instance === undefined) {
      Absorption.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Absorption {
    if (!Absorption.instance) {
      Absorption.instance = new Absorption();
    }
    return Absorption.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Absorption.GetInstance() as T;
  }
}

export default Absorption;
