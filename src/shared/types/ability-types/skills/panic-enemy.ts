import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PanicEnemy implements IAbility {
  private static instance: PanicEnemy;

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
PANIC ENEMY
Panic enemy allows the bandit to attempt to send the enemy into a panic
which causes them to have trouble when fleeing and also might affect their
ability to hit.
        `;

    if (PanicEnemy.instance === undefined) {
      PanicEnemy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PanicEnemy {
    if (!PanicEnemy.instance) {
      PanicEnemy.instance = new PanicEnemy();
    }
    return PanicEnemy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PanicEnemy.GetInstance() as T;
  }
}

export default PanicEnemy;
