import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class FourthAttack implements IAbility {
  private static instance: FourthAttack;

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
    this.name = "FourthAttack";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help 'Fourth Attack'
fourth attack
FOURTH ATTACK
Given that the Barbarian cares nothing for magic, he is unfettered by the
time restraints needed for the study and practice of casting.  Instead, a
Barbarian may choose to devote his time to the study of weaponry and
fighting.  This additional training comes in handy as the Barbarian becomes
so adept at fighting that he can often recieve a fourth attack in combat.
see also 'BARBARIAN'`;

    if (FourthAttack.instance === undefined) {
      FourthAttack.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FourthAttack {
    if (!FourthAttack.instance) {
      FourthAttack.instance = new FourthAttack();
    }
    return FourthAttack.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FourthAttack.GetInstance() as T;
  }
}

export default FourthAttack;
