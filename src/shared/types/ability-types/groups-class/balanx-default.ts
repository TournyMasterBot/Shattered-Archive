import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Detection from "../groups-spells/detection";
import Healing from "../groups-spells/healing";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Maladictions from "../groups-spells/maladictions";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Illusion from "../groups-spells/illusion";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Creation from "../groups-spells/creation";
import Weather from "../groups-spells/weather";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Focus from "@shared/types/ability-types/skills/focus";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import Swim from "@shared/types/ability-types/skills/swim";
import FourthAttack from "@shared/types/ability-types/skills/fourth-attack";
import TimeStop from "@shared/types/ability-types/spells/time-stop";
import BalanxBasics from "./balanx-basics";
import View from "@shared/types/ability-types/spells/view";

export class BalanxDefault implements IAbilityGroup {
  static instance: BalanxDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BalanxDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...BalanxBasics.GetInstance().Get<BalanxBasics>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Creation.GetInstance().Get<Creation>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      SecondAttack.GetInstance().Get(),
      HandToHand.GetInstance().Get(),
      Focus.GetInstance().Get(),
      ThirdAttack.GetInstance().Get(),
      TimeStop.GetInstance().Get(),
      Swim.GetInstance().Get(),
      FourthAttack.GetInstance().Get(),
      View.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BalanxDefault {
    if (!BalanxDefault.instance) {
      BalanxDefault.instance = new BalanxDefault();
    }
    return BalanxDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BalanxDefault.GetInstance() as T;
  }
}

export default BalanxDefault;
