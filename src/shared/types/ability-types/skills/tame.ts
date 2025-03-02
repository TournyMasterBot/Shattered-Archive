import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Tame implements IAbility {
  private static instance: Tame;

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
TAME
Syntax:  tame <mob>
         tame
Tame is a skill known only to Rangers and Druids.  It allows them to calm wild beasts
to prevent them from attacking players or to make the fighting in a room stop.
It may be used with an argument to specify the beast to be tamed, if more than one beast is present in the room and/or there is no combat taking place.
It is not possible for a ranger to remain calm enough himself while in combat
to tame other creatures.
See also:  RANGERS DRUID`;

    this.manualDescription = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Tame {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Tame.GetInstance() as T;
  }
}

export default Tame;
