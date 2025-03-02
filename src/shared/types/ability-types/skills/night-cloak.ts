import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class NightCloak implements IAbility {
  private static instance: NightCloak;

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
NIGHT CLOAK

Syntax: Nightcloak

Stealth is of paramount importance to those who practice the ninja's arts,
the refinements made through the ages culminating in an ability known as
Night Cloak. By shedding their light source, a ninja may become entirely
unseen within a dark room, becoming one with the shadows to better ambush
their target. This skill requires both ample darkness within a room and a
ninja to forego their light source in order to succeed.  

SEE ALSO:  NINJA
`;

    if (NightCloak.instance === undefined) {
      NightCloak.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): NightCloak {
    if (!NightCloak.instance) {
      NightCloak.instance = new NightCloak();
    }
    return NightCloak.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NightCloak.GetInstance() as T;
  }
}

export default NightCloak;
