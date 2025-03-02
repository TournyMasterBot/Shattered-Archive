import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Fake implements IAbility {
  private static instance: Fake;

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
    this.helpFile = `help fake
FAKE
A useful trick that charlatans have available to them is the ability to
'fake out' an opponent. In this manner, a charlatan, at times, may attempt
to fool an opponent into believing that they are casting a spell, or using a
skill, that they may not actually have available to them.`;

    if (Fake.instance === undefined) {
      Fake.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fake {
    if (!Fake.instance) {
      Fake.instance = new Fake();
    }
    return Fake.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fake.GetInstance() as T;
  }
}

export default Fake;
