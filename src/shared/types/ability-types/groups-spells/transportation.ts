import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Fly from "@shared/types/ability-types/spells/Fly";
import PassDoor from "@shared/types/ability-types/spells/PassDoor";
import Teleport from "@shared/types/ability-types/spells/Teleport";
import Gate from "@shared/types/ability-types/spells/Gate";
import Portal from "@shared/types/ability-types/spells/Portal";
import WordOfRecall from "@shared/types/ability-types/spells/WordOfRecall";
import Nexus from "@shared/types/ability-types/spells/Nexus";
import Summon from "@shared/types/ability-types/spells/Summon";
import Waypoint from "@shared/types/ability-types/spells/Waypoint";
import ServerCache from "@shared/cache/server-cache";

export class Transportation implements IAbilityGroup {
  static instance: Transportation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Transportation;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Fly.GetInstance(),
      PassDoor.GetInstance(),
      Teleport.GetInstance(),
      Gate.GetInstance(),
      Portal.GetInstance(),
      WordOfRecall.GetInstance(),
      Nexus.GetInstance(),
      Summon.GetInstance(),
      Waypoint.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Transportation {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Transportation.GetInstance() as T;
  }
}

export default Transportation;
