import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Purification from "../groups-spells/Purification";
import Creation from "../groups-spells/Creation";
import Protective from "../groups-spells/Protective";
import Detection from "../groups-spells/Detection";
import Weather from "../groups-spells/Weather";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Transportation from "../groups-spells/Transportation";
import Healing from "../groups-spells/Healing";
import Whip from "@shared/types/ability-types/skills/whip";
import Staff from "@shared/types/ability-types/skills/staff";
import ServerCache from "@shared/cache/server-cache";

export class ConfessorDefault implements IAbilityGroup {
  static instance: ConfessorDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ConfessorDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Purification.GetInstance().abilities,
      ...Creation.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      Whip.GetInstance(),
      Staff.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConfessorDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConfessorDefault.GetInstance() as T;
  }
}

export default ConfessorDefault;
