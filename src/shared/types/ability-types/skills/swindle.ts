import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Swindle implements IAbility {
  private static instance: Swindle;

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
SWINDLE

A favored trade of the charlatan is enjoying a bit of trickery with various
vendors throughout the realm.  

Such enjoyment do they derive from such interaction, that ofttimes a
charlatan may attempt to swindle a desired item from said vendor.  The
ability to swindle allows the charlatan the opportunity to quite possibly
swipe an item from a vendor, perhaps an item that they may very well have
had to pay good money for otherwise.  
 
See also : Help Charlatan
`;

    if (Swindle.instance === undefined) {
      Swindle.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Swindle {
    if (!Swindle.instance) {
      Swindle.instance = new Swindle();
    }
    return Swindle.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Swindle.GetInstance() as T;
  }
}

export default Swindle;
