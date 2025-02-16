import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";
export class SecondAttack implements IAbility {
  private static instance: SecondAttack;

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
    this.name = "Second Attack";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `
help 'Second Attack'
'SECOND ATTACK'
Training in second attack allows the character a chance at additional
strikes in combat -- although a 100% second attack does NOT guarantee 2
attacks every round. Any class may learn this skill, although clerics and
mages have a very hard time with it.
`;
    if (SecondAttack.instance === undefined) {
      SecondAttack.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SecondAttack {
    if (!SecondAttack.instance) {
      SecondAttack.instance = new SecondAttack();
    }
    return SecondAttack.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SecondAttack.GetInstance() as T;
  }
}

export default SecondAttack;
