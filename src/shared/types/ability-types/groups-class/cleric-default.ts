import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Attack from "../groups-spells/attack";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Creation from "../groups-spells/creation";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Detection from "../groups-spells/detection";
import Healing from "../groups-spells/healing";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Weather from "../groups-spells/weather";
import Flail from "@shared/types/ability-types/skills/flail";

export class ClericDefault implements IAbilityGroup {
  static instance: ClericDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ClericDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Attack.GetInstance().Get<Attack>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Creation.GetInstance().Get<Creation>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      new Flail(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ClericDefault {
    if (!ClericDefault.instance) {
      ClericDefault.instance = new ClericDefault();
    }
    return ClericDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ClericDefault.GetInstance() as T;
  }
}

export default ClericDefault;
