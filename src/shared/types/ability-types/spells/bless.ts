import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Bless implements IAbility {
  private static instance: Bless;

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
help Bless
BLESS
BLESS

Syntax: cast bless <character>
        cast bless <object>

This spell improves the to-hit roll and saving throw versus spell of the
target character by 1 for every 8 levels of the caster. It may also be cast
on an object to temporarily bless it (blessed weapons, for example, are more
effective against demonic beings).  

See also - BENEDICTIONS 
`;
    this.manualDescription = `
Blessing objects also improves character saves, making it more difficult to land maladictions on you.
`;

    if (Bless.instance === undefined) {
      Bless.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Bless {
    if (!Bless.instance) {
      Bless.instance = new Bless();
    }
    return Bless.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Bless.GetInstance() as T;
  }
}

export default Bless;
