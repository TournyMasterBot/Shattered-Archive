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
import BalanxBasics from "./BalanxBasics";
import View from "@shared/types/ability-types/spells/view";
import ServerCache from "@shared/cache/server-cache";

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
      ...BalanxBasics.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Creation.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      SecondAttack.GetInstance(),
      HandToHand.GetInstance(),
      Focus.GetInstance(),
      ThirdAttack.GetInstance(),
      TimeStop.GetInstance(),
      Swim.GetInstance(),
      FourthAttack.GetInstance(),
      View.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BalanxDefault {
    if (!BalanxDefault.instance) {
      BalanxDefault.instance = new BalanxDefault();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return BalanxDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BalanxDefault.GetInstance() as T;
  }
}

export default BalanxDefault;
