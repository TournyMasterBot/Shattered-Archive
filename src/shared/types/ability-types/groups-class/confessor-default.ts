import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Purification from "../groups-spells/purification";
import Creation from "../groups-spells/creation";
import Protective from "../groups-spells/protective";
import Detection from "../groups-spells/detection";
import Weather from "../groups-spells/weather";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Transportation from "../groups-spells/transportation";
import Healing from "../groups-spells/healing";
import Whip from "@shared/types/ability-types/skills/whip";
import Staff from "@shared/types/ability-types/skills/staff";

export class ConfessorDefault implements IAbilityGroup {
  static instance: ConfessorDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ConfessorDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Purification.GetInstance().Get<Purification>().abilities,
      ...Creation.GetInstance().Get<Creation>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      new Whip(),
      new Staff(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConfessorDefault {
    if (!ConfessorDefault.instance) {
      ConfessorDefault.instance = new ConfessorDefault();
    }
    return ConfessorDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConfessorDefault.GetInstance() as T;
  }
}

export default ConfessorDefault;
