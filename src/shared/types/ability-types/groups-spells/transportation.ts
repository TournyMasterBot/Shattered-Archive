import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Fly from "@shared/types/ability-types/spells/fly";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Teleport from "@shared/types/ability-types/spells/teleport";
import Gate from "@shared/types/ability-types/spells/gate";
import Portal from "@shared/types/ability-types/spells/portal";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import Nexus from "@shared/types/ability-types/spells/nexus";
import Summon from "@shared/types/ability-types/spells/summon";
import Waypoint from "@shared/types/ability-types/spells/waypoint";

export class Transportation implements IAbilityGroup {
  static instance: Transportation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Transportation;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Fly.GetInstance().Get(),
      PassDoor.GetInstance().Get(),
      Teleport.GetInstance().Get(),
      Gate.GetInstance().Get(),
      Portal.GetInstance().Get(),
      WordOfRecall.GetInstance().Get(),
      Nexus.GetInstance().Get(),
      Summon.GetInstance().Get(),
      Waypoint.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Transportation {
    if (!Transportation.instance) {
      Transportation.instance = new Transportation();
    }
    return Transportation.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Transportation.GetInstance() as T;
  }
}

export default Transportation;
