import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PoisonSmoke implements IAbility {
  private static instance: PoisonSmoke;

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
    this.name = "Poison Smoke";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
'POISON SMOKE' 'POISONSMOKE'
This skill is similar to flash bomb. The skilled assassin can mix the
proper ingredients to release a cloud of poisonous gas when their bomb
explodes.
`;

    if (PoisonSmoke.instance === undefined) {
      PoisonSmoke.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PoisonSmoke {
    if (!PoisonSmoke.instance) {
      PoisonSmoke.instance = new PoisonSmoke();
    }
    return PoisonSmoke.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PoisonSmoke.GetInstance() as T;
  }
}

export default PoisonSmoke;
