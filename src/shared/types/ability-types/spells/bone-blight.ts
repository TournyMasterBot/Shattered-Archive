import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BoneBlight implements IAbility {
  private static instance: BoneBlight;

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
'BONE BLIGHT'
BONE BLIGHT

Syntax: c 'bone blight' <target>

The bone blight is a Necromancer's curse, a horrid affliction that turns the
bones of the victim to soft, rubber tissue.  It is incredibly painful, and
renders the victim particularly vulnerable to bludgeoning attacks.  

It can generally be cured via a standard 'remove curse' casting.  

See also - NECROMANCY NECROMANCER 
`;

    if (BoneBlight.instance === undefined) {
      BoneBlight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BoneBlight {
    if (!BoneBlight.instance) {
      BoneBlight.instance = new BoneBlight();
    }
    return BoneBlight.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BoneBlight.GetInstance() as T;
  }
}

export default BoneBlight;
