import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Haggle implements IAbility {
  private static instance: Haggle;

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
    this.name = "Haggle";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help Haggle
HAGGLE HAGGLING
Haggling is an indispensable skill to the trader.  It allows a character to
match wits with a merchant, seeking to get a better price for merchandise,
or to buy at the lowest possible cost.  Unfortunately, most merchants are
already very skilled at haggling, so the untrained adventurer had best 
guard his treasure closely.  Thieves are natural masters at haggling,
although other classes may learn it as well.`;

    if (Haggle.instance === undefined) {
      Haggle.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Haggle {
    if (!Haggle.instance) {
      Haggle.instance = new Haggle();
    }
    return Haggle.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Haggle.GetInstance() as T;
  }
}

export default Haggle;
