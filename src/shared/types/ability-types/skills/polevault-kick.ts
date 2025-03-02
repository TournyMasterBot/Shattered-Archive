import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PolevaultKick implements IAbility {
  private static instance: PolevaultKick;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
POLEVAULT KICK

Syntax:  Polevault
         Polevault target

Planting their staff to the ground, the jongleur leaps up with a quick but
firm kick toward the enemy's sternum. So forceful is the blow that it not
only hurts the foe but even has a chance to even knock them off their feet.
Mounted foes run the risk of being knocked from their steed.

Groups containing this skill: JONGLEUR DEFAULT
`;

    if (PolevaultKick.instance === undefined) {
      PolevaultKick.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PolevaultKick {
    if (!PolevaultKick.instance) {
      PolevaultKick.instance = new PolevaultKick();
    }
    return PolevaultKick.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PolevaultKick.GetInstance() as T;
  }
}

export default PolevaultKick;
